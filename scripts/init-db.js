import 'dotenv/config'
import process from 'node:process'
import {getAllDossiers} from '../lib/util/demarches-simplifies/index.js'
import mongo from '../lib/util/mongo.js'

const demarcheNumber = Number.parseInt(process.env.DS_DEMARCHE_NUMBER, 10)

// Connect to MongoDB
await mongo.connect()

async function main() {
  return getAllDossiers({
    demarcheNumber,
    first: 100,
    includeDossiers: true,
    includeChamps: true
  })
}

// Call the main function and ensure MongoDB is disconnected afterwards
try {
  await main()
} finally {
  // Disconnect from MongoDB
  await mongo.disconnect()
}
