import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const client = new MongoClient(process.env.MONGO_URI);
const DB_NAME = "emailAutomationDB";   // same as in your connection string
const COLLECTION = "state";

async function loadState() {
  await client.connect();
  const db = client.db(DB_NAME);
  const state = await db.collection(COLLECTION).findOne({ _id: "stateDoc" });
  return state || { lastFile: null, lastIndex: -1, lastSentTime: 0, leadsCount: 0 };
}

async function saveState(state) {
  const db = client.db(DB_NAME);
  await db.collection(COLLECTION).updateOne(
    { _id: "stateDoc" },
    { $set: state },
    { upsert: true }
  );
}

export { loadState, saveState, client };
