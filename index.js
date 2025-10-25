import express from 'express';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();


const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FOLDER = './leads';        // folder containing CSVs
const STATE_FILE = './state.json';    // stores last sent info







app.use(cors({
    origin: 'https://pixelforgeagency.org'  // allow only your website
}));
  






// Load state
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return { lastFile: null, lastIndex: -1, lastSentTime: 0 };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}












// Save state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}











// Send email to a lead
async function sendEmailToLead(lead) {
  const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true, // true for 465, false for 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Ali Nasir" <${process.env.EMAIL_USER}>`,
    to: lead["Email"],
    subject: `Let's build something amazing for your brand`,
    html: `<p>
    Hi ${lead["First Name"]},<br>
    Use this number if you need any services from pixelforgeagency.org:<br>
    +92 3117561796
    </p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Sent to ${lead["Email"]}`);
  } catch (err) {
    console.log(`❌ Failed: ${lead["Email"]}`, err.message);
  }
}













// Get next lead based on state
async function getNextLead() {
  const state = loadState();
  const now = Date.now();

  // Random delay 1.5-2.5 hours in ms
  const minDelay = 1.5 * 60 * 60 * 1000;
  const maxDelay = 2.5 * 60 * 60 * 1000;
  const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;

  if (now - state.lastSentTime < randomDelay) {
    console.log('Not enough time passed');
    return null; 
  }

  // Get CSV files sorted by creation time
  const files = fs.readdirSync(DATA_FOLDER)
    .filter(f => f.endsWith('.csv'))
    .sort((a, b) => fs.statSync(path.join(DATA_FOLDER, a)).birthtimeMs - fs.statSync(path.join(DATA_FOLDER, b)).birthtimeMs);

  if (files.length === 0) return null;

  let fileToUse = state.lastFile && files.includes(state.lastFile) ? state.lastFile : files[0];
  let startIndex = (state.lastFile === fileToUse) ? state.lastIndex + 1 : 0;

  // Read leads from CSV
  const leads = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(path.join(DATA_FOLDER, fileToUse))
      .pipe(csv())
      .on('data', (data) => leads.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  if (startIndex >= leads.length) {
    // Move to next CSV if available
    const idx = files.indexOf(fileToUse);
    if (idx + 1 < files.length) {
      fileToUse = files[idx + 1];
      startIndex = 0;
    } else {
      return null; // No more leads
    }
  }

  return { lead: leads[startIndex], file: fileToUse, index: startIndex };
}





















// API endpoint
app.get('/send-email', async (req, res) => {
  try {
    const next = await getNextLead();
    if (!next) return res.send('✅ Not enough time passed or all leads sent');

    await sendEmailToLead(next.lead);

    // Update state
    saveState({
      lastFile: next.file,
      lastIndex: next.index,
      lastSentTime: Date.now()
    });

    res.send(`Email sent to ${next.lead["Email"]}`);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

















app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
