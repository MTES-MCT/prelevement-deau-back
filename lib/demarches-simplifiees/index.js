/* eslint-disable no-await-in-loop */
import 'dotenv/config'

import {
  validateCamionCiterneFile,
  validateMultiParamFile
} from '@fabnum/prelevements-deau-timeseries-parsers'
import {calculateObjectSize} from 'bson'

import {defer} from '../util/defer.js'
import s3 from '../util/s3.js'

import * as Dossier from '../models/dossier.js'
import * as Preleveur from '../models/preleveur.js'

import {extractDossier} from './extract.js'

import {sync, iterate, getAttachmentObjectKey} from '@fabnum/demarches-simplifiees'

export async function resyncAllDossiers(demarcheNumber) {
  async function onDossier({dossier, attachments}) {
    console.log(`Processing dossier ${demarcheNumber}/${dossier.number}`)
    await processDossier(demarcheNumber, dossier, attachments)
  }

  await iterate(demarcheNumber, {onDossier, s3: s3('ds')})
}

export async function syncUpdatedDossiers(demarcheNumber) {
  async function onDossier({dossier, attachments, isUpdated}) {
    if (isUpdated) {
      await processDossier(demarcheNumber, dossier, attachments)
    }
  }

  await sync(demarcheNumber, {onDossier, s3: s3('ds')})
}

export async function processDossier(demarcheNumber, rawDossier, storageKeys) {
  const dossier = extractDossier(rawDossier)

  const existingAttachments = await Dossier.getAttachmentsSummary(demarcheNumber, dossier.number)

  // Compute the list of attachments to remove
  const storageKeysToRemove = existingAttachments
    .filter(a => !storageKeys.includes(a.storageKey))
    .map(a => a.storageKey)

  await Dossier.removeAttachmentsByStorageKey(demarcheNumber, dossier.number, storageKeysToRemove)

  // Compute the list of storageKey to add
  const storageKeysToAdd = storageKeys
    .filter(storageKey => !existingAttachments.some(a => a.storageKey === storageKey))

  await Promise.all(
    storageKeysToAdd.map(
      storageKey => Dossier.createAttachment(demarcheNumber, dossier.number, storageKey)
    )
  )

  // Update the dossier in the database

  const attachmentsUpdated = storageKeysToAdd.length > 0 || storageKeysToRemove.length > 0

  await Dossier.upsertDossier(
    demarcheNumber,
    attachmentsUpdated ? {...dossier, attachmentsUpdated: true, contentUpdated: true} : dossier
  )

  // Defer consolidation
  defer(() => consolidateDossier(demarcheNumber, dossier.number))
}

async function consolidateDossier(demarcheNumber, dossierNumber) {
  console.log(`Consolidating dossier ${demarcheNumber}/${dossierNumber}`)
  const dossier = await Dossier.getDossierByNumero(demarcheNumber, dossierNumber)

  await processAttachments(demarcheNumber, dossierNumber, dossier.typePrelevement)

  const result = {}

  const preleveur = await Preleveur.getPreleveurByEmail(dossier.declarant.email || dossier.usager.email)

  if (preleveur) {
    result.preleveur = preleveur._id
  }

  await Dossier.updateDossier(
    demarcheNumber,
    dossierNumber,
    {result, contentUpdated: false, attachmentsUpdated: false, consolidatedAt: new Date()}
  )
}

async function processAttachments(demarcheNumber, dossierNumber, typePrelevement) {
  const unprocessedAttachments = await Dossier.getUnprocessedAttachments(demarcheNumber, dossierNumber)

  for (const attachment of unprocessedAttachments) {
    await processAttachment(attachment, typePrelevement)
  }
}

async function processAttachment(attachment, typePrelevement) {
  const isSheetFile = isSheet(attachment.storageKey)

  if (!isSheetFile) {
    await Dossier.updateAttachment(attachment._id, {processed: true})
    return
  }

  const {demarcheNumber, dossierNumber, storageKey} = attachment

  const objectKey = getAttachmentObjectKey(
    demarcheNumber,
    dossierNumber,
    storageKey
  )

  let buffer

  try {
    buffer = await s3('ds').downloadObject(objectKey)
  } catch {
    await Dossier.updateAttachment(attachment._id, {
      processingError: `Unable to download file ${objectKey}`,
      processed: true
    })
  }

  const result = {}
  let validationStatus = null

  if (typePrelevement === 'camion-citerne') {
    const {errors, data} = await validateCamionCiterneFile(buffer)
    result.errors = errors
    result.data = data
  } else if (typePrelevement === 'aep-zre' || typePrelevement === 'icpe-hors-zre') {
    const {errors, data} = await validateMultiParamFile(buffer)
    result.errors = errors
    result.data = data
  }

  result.errors &&= result.errors.map(error => ({
    ...error,
    severity: error.severity || 'error'
  }))

  if (result.errors?.length > 50) {
    result.errors = result.errors.slice(0, 50)
    result.errors.push({
      message: 'Le fichier contient plus de 50 erreurs. Les erreurs suivantes n’ont pas été affichées.'
    })
  }

  if (calculateObjectSize(result) > 14 * 1024 * 1024) { // 14 Mo
    await Dossier.updateAttachment(attachment._id, {
      processingError: 'Attachment result too large',
      processed: true,
      validationStatus: 'failed'
    })
    return
  }

  if (result && result.errors?.length > 0) {
    validationStatus = result.errors.some(error => error.severity === 'error')
      ? 'error'
      : 'warning'
  } else {
    validationStatus = 'success'
  }

  await Dossier.updateAttachment(attachment._id, {processed: true, result, validationStatus})
}

/* Helpers */

function isSheet(filename) {
  const lcFilename = filename.toLowerCase()
  return lcFilename.endsWith('.xlsx') || lcFilename.endsWith('.xls') || lcFilename.endsWith('.ods')
}
