import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { loadState, saveState } from './db.js';
dotenv.config();

const DATA_FOLDER = './leads';        // folder containing CSVs
const STATE_FILE = './state.json';    // stores last sent info








// // ---------- State Management ----------
// function loadState() {
//     if (!fs.existsSync(STATE_FILE)) {
//         return { lastFile: null, lastIndex: -1, lastSentTime: 0 };
//     }
//     return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
// }

// function saveState(state) {
//     fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
// }













// ---------- Email Sending ----------
async function sendEmailToLead(lead) {

    const transporter = nodemailer.createTransport({
        host: "smtp.zoho.com",
        port: 465,
        secure: true,
        auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
        },
    });
    

    const mailOptions = {
        from: `"Ali Nasir" <${process.env.EMAIL_USER}>`,
        to: lead["Email"],
        subject: `Let's build something great for your brand`,
        html: `<p>
        Hi ${lead["First Name"]},<br>
        Use this number if you need any services from <a href="https://pixelforgeagency.org">pixelforgeagency.org</a>:<br>
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
















// ---------- Lead Selection ----------
async function getNextLead() {
    const state = loadState();
    const now = Date.now();

    // Random delay between 1.5–2.5 hours
    const minDelay = 1.5 * 60 * 60 * 1000;
    const maxDelay = 2.5 * 60 * 60 * 1000;
    const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;

    if (now - state.lastSentTime < randomDelay) {
        console.log('⏳ Not enough time passed');
        return null;
    }

    const files = fs.readdirSync(DATA_FOLDER)
        .filter(f => f.endsWith('.csv'))
        .sort((a, b) => fs.statSync(path.join(DATA_FOLDER, a)).birthtimeMs - fs.statSync(path.join(DATA_FOLDER, b)).birthtimeMs);

    if (files.length === 0) return null;

    let fileToUse = state.lastFile && files.includes(state.lastFile) ? state.lastFile : files[0];
    let startIndex = (state.lastFile === fileToUse) ? state.lastIndex + 1 : 0;

    const leads = [];
    await new Promise((resolve, reject) => {
        fs.createReadStream(path.join(DATA_FOLDER, fileToUse))
        .pipe(csv())
        .on('data', (data) => leads.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    if (startIndex >= leads.length) {
        const idx = files.indexOf(fileToUse);
        if (idx + 1 < files.length) {
        fileToUse = files[idx + 1];
        startIndex = 0;
        } else {
        return null;
        }
    }

    return { lead: leads[startIndex], file: fileToUse, index: startIndex };
}















// ---------- Random Chance Control ----------
async function main() {
    // 5% chance to actually run
    const runChance = Math.random();
    if (runChance > 0.05) {
        console.log(`🕒 Skipping this run (chance=${(runChance * 100).toFixed(1)}%)`);
        return;
    }

    console.log('🚀 Running job (chance met)...');

    const next = await getNextLead();
    if (!next) {
        console.log('✅ No new leads or waiting period not reached.');
        return;
    }

    await sendEmailToLead(next.lead);

    saveState({
        lastFile: next.file,
        lastIndex: next.index,
        lastSentTime: Date.now()
    });

    console.log(`📧 Email sent to ${next.lead["Email"]}`);
}

main().catch(err => console.error(err));
