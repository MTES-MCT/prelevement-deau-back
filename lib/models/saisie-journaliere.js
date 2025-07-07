import mongo from '../util/mongo.js'

export async function upsertSaisieJournaliere(origin, idDeclaration, date, saisieJournaliere) {
  const {idPreleveur, idPointPrelevement} = origin

  const query = {
    id_preleveur: idPreleveur,
    id_point: idPointPrelevement,
    date
  }

  const changes = {
    saisieJournaliere,
    id_declaration: idDeclaration,
    updateAt: new Date()
  }

  await mongo.db.collection('saisies_journalieres').updateOne(
    query,
    {$set: changes, $setOnInsert: {createAt: new Date()}},
    {upsert: true}
  )
}

export async function deleteSaisieJournaliere(origin, date) {
  const {idPreleveur, idPointPrelevement} = origin

  const query = {
    id_preleveur: idPreleveur,
    id_point: idPointPrelevement,
    date
  }

  await mongo.db.collection('saisies_journalieres').deleteOne(query)
}

export async function getSaisieJournaliere(origin, date) {
  const {idPreleveur, idPointPrelevement} = origin

  const query = {
    id_preleveur: idPreleveur,
    id_point: idPointPrelevement,
    date
  }

  return mongo.db.collection('saisies_journalieres').findOne(query)
}

export async function getSaisiesJournalieres(origin, fromDate, toDate) {
  const {idPreleveur, idPointPrelevement} = origin

  const query = {
    id_preleveur: idPreleveur,
    id_point: idPointPrelevement,
    date: {$gte: fromDate, $lte: toDate}
  }

  return mongo.db.collection('saisies_journalieres').find(query).toArray()
}
