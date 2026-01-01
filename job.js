import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { loadState, saveState, client } from './db.js';
dotenv.config();

const DATA_FOLDER = './leads';        // folder containing CSVs








// // ---------- State Management ----------
// const STATE_FILE = './state.json';    // stores last sent info
// function loadState() {
//     if (!fs.existsSync(STATE_FILE)) {
//         return { lastFile: null, lastIndex: -1, lastSentTime: 0 };
//     }
//     return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
// }

// function saveState(state) {
//     fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
// }














// ---------- Lead Selection ----------
async function getNextLead() {
    const state = await loadState(); // load from MongoDB

    // ---------- File Ordering Rules ----------
    // apollo-contacts-export.csv       → first
    // apollo-contacts-export (1).csv   → second
    // apollo-contacts-export (2).csv   → third
    function fileOrder(filename) {
        const base = "apollo-contacts-export.csv";
        if (filename === base) return 0;
        const match = filename.match(/\((\d+)\)\.csv$/);
        if (match) return parseInt(match[1]);

        // unexpected naming goes last
        return Infinity;
    }

    // Load all CSV filenames, sort using our custom ordering
    const files = fs.readdirSync(DATA_FOLDER)
        .filter(f => f.endsWith(".csv"))
        .sort((a, b) => fileOrder(a) - fileOrder(b));

    if (files.length === 0) return null;

    // Pick file to use based on last saved state
    let fileToUse =
        state.lastFile && files.includes(state.lastFile)
            ? state.lastFile
            : files[0];

    // If same file, move to next index. If new file, start at 0.
    let startIndex =
        state.lastFile === fileToUse ? state.lastIndex + 1 : 0;

    // Helper to load CSV rows
    async function loadCSV(file) {
        const rows = [];
        await new Promise((resolve, reject) => {
            fs.createReadStream(path.join(DATA_FOLDER, file))
                .pipe(csv())
                .on("data", (data) => rows.push(data))
                .on("end", resolve)
                .on("error", reject);
        });
        return rows;
    }

    // Load leads in the current file
    let leads = await loadCSV(fileToUse);

    // ---------- If file is finished, move to next file ----------
    while (startIndex >= leads.length) {
        const idx = files.indexOf(fileToUse);

        // no more files left → nothing to send
        if (idx + 1 >= files.length) return null;

        // switch to next file and reload
        fileToUse = files[idx + 1];
        startIndex = 0;
        leads = await loadCSV(fileToUse);
    }

    // ---------- Return next lead ----------
    return {
        lead: leads[startIndex],
        file: fileToUse,
        index: startIndex,
        leadsCount: (state.leadsCount || 0) + 1,
    };
}













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
    

    // const mailOptions = {
    //     from: `"Ali Nasir" <${process.env.EMAIL_USER}>`,
    //     to: lead["Email"],
    //     subject: `Let's build something great for ${lead["Company Name"]}!`,
    //     html: `<p>
    //     Hi ${lead["First Name"]},<br>
    //     Use this number if you need any services from <a href="https://pixelforgeagency.org">pixelforgeagency.org</a>:<br>
    //     +92 3117561796
    //     </p>`,
    // };


    const mailOptions = {
        from: `"Ali Nasir" <${process.env.EMAIL_USER}>`,
        to: lead["Email"],
        subject: `Let's elevate ${lead["Company Name"]}'s digital presence`,
        html: `
        <div style="font-family: Arial, sans-serif; color: #1a1a1a; line-height: 1.6; font-size: 15px;">
            <p>Hi ${lead["First Name"]},</p>
        
            <p>
                I noticed ${lead["Company Name"]} is doing great work${lead["Industry"] ? ` in the ${lead["Industry"].toLowerCase()} space` : ""}.
                At PixelForge, we help businesses like yours 
                stand out online through modern <strong>UI/UX design</strong>, high-performance <strong>web & mobile development</strong>, 
                and reliable <strong>backend systems</strong>.
            </p>
        
            <p>
                Would you be open to seeing a few quick ideas on how we could improve your website or app experience for ${lead["Company Name"]}?  
                (No cost or commitment, just a quick look.)
            </p>
        
            <p>
                You can reply here, through WhatsApp: <span style="color: #555;">+92 3117561796</span> or visit  
                <a href="https://pixelforgeagency.org" style="color: #0066cc; text-decoration: none;">pixelforgeagency.org</a>  
                to view some of our work.
            </p>
        
            <p>Best regards,<br>
            Ali Nasir<br>
            Founder, PixelForge<br>
            </p>
        
            <hr style="border:none; border-top:1px solid #eee; margin-top:20px;">
            <p style="font-size:12px; color:#888;">
                Sent to ${lead["Email"]} for ${lead["Company Name"]}.  
                If not relevant, you can simply ignore this email.
            </p>
        </div>
        `
    };
      

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Sent to ${lead["Email"]}`);
    } catch (err) {
        console.log(`❌ Failed: ${lead["Email"]}`, err.message);
    }
}


















// ---------- Random Chance Control ----------
async function main() {
    // 5% chance to actually run
    const runChance = Math.random();
    if (runChance > 0.1) {
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

    await saveState({
        lastFile: next.file,
        lastIndex: next.index,
        lastSentTime: Date.now(),
        leadsCount: next.leadsCount
    });

    console.log(`📧 Email sent to ${next.lead["Email"]}`);

    // Close MongoDB connection
    await client.close();
    
    // Exit Node process
    process.exit(0);
}

main().catch(err => console.error(err));
