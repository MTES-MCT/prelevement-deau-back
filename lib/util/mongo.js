import process from 'node:process'

import {MongoClient, ObjectId} from 'mongodb'

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost'
const MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'prelevements-deau'

class Mongo {
  async connect(connectionString) {
    if (this.db) {
      throw new Error('mongo.connect() should not be called twice')
    }

    this.client = new MongoClient(connectionString || MONGODB_URL)
    await this.client.connect()
    this.dbName = MONGODB_DBNAME
    this.db = this.client.db(this.dbName)

    await this.createIndexes()
  }

  async createIndexes() {
    await this.db.collection('dossiers').createIndex({demarcheNumber: 1})
    await this.db.collection('dossiers').createIndex({demarcheNumber: 1, number: 1}, {unique: true})

    await this.db.collection('dossier_attachments').createIndex({demarcheNumber: 1, dossierNumber: 1})
    await this.db.collection('dossier_attachments').createIndex({demarcheNumber: 1, dossierNumber: 1, storageKey: 1}, {unique: true})

    await this.db.collection('volumes_preleves').createIndex({exploitation: 1})
    await this.db.collection('volumes_preleves').createIndex({exploitation: 1, date: 1}, {unique: true})
    await this.db.collection('points_prelevement').createIndex({id_point: 1}, {unique: true})
    await this.db.collection('exploitations').createIndex({id_exploitation: 1}, {unique: true})
    await this.db.collection('preleveurs').createIndex({id_preleveur: 1}, {unique: true})

    await mongo.db.collection('saisies_journalieres').createIndex(
      {preleveur: 1, point: 1, date: 1},
      {unique: true}
    )
  }

  disconnect(force) {
    const {client} = this
    this.client = undefined
    this.db = undefined

    return client.close(force)
  }

  parseObjectId(string) {
    try {
      return ObjectId.createFromHexString(string)
    } catch {
      return null
    }
  }
}

const mongo = new Mongo()

export default mongo
export {ObjectId} from 'mongodb'

