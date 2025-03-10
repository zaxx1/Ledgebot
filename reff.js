import fetch from 'node-fetch';
import { ethers } from 'ethers';
import fs from 'fs';
import readline from 'readline';
import cfonts from 'cfonts';
import chalk from 'chalk';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const verifyApiUrl = 'https://referralapi.layeredge.io/api/referral/verify-referral-code';


const headers = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://dashboard.layeredge.io',
  'Referer': 'https://dashboard.layeredge.io/',
  'Sec-CH-UA': '"Not A(Brand";v="8", "Chromium";v="132", "Microsoft Edge";v="132"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0'
};

let useProxy = false;
let proxyList = [];

function getProxyAgent(proxy) {
  if (!proxy) return null;
  const proxyRegex = /^(?:(http|https|socks4|socks5|socks4h|socks5h):\/\/)?(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/i;
  const match = proxy.match(proxyRegex);
  let protocol, username, password, host, port;
  if (match) {
    protocol = (match[1] || 'http').toLowerCase();
    if (protocol === 'socks5h') protocol = 'socks5';
    if (protocol === 'socks4h') protocol = 'socks4';
    username = match[2];
    password = match[3];
    host = match[4];
    port = match[5];
  } else {
    const parts = proxy.split(':');
    if (parts.length >= 2) {
      protocol = 'http';
      host = parts[0];
      port = parts[1];
      if (parts.length > 2) {
        protocol = parts[0].toLowerCase();
        if (protocol === 'socks5h') protocol = 'socks5';
        if (protocol === 'socks4h') protocol = 'socks4';
        host = parts[1];
        port = parts[2];
      }
    } else {
      throw new Error(`Invalid proxy format: ${proxy}`);
    }
  }
  const proxyUrl = username && password
    ? `${protocol}://${username}:${password}@${host}:${port}`
    : `${protocol}://${host}:${port}`;

  if (protocol === 'http' || protocol === 'https') {
    return new HttpsProxyAgent(proxyUrl);
  } else if (protocol === 'socks4' || protocol === 'socks5') {
    return new SocksProxyAgent(proxyUrl);
  } else {
    throw new Error(`Unsupported proxy protocol: ${protocol}`);
  }
}

function centerText(text, color = "greenBright") {
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.length;
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  return " ".repeat(padding) + chalk[color](text);
}


async function getPublicIP(agent) {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { agent, timeout: 5000 });
    const data = await res.json();
    return data.ip;
  } catch (err) {
    console.error(chalk.red(`Gagal mendapatkan public IP: ${err.message}`));
    return null;
  }
}


async function countdownWithMessage(message, seconds) {
  return new Promise(resolve => {
    let remainingSeconds = seconds;
    const interval = setInterval(() => {
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(`${message} (${remainingSeconds} detik)`);
      remainingSeconds--;
      if (remainingSeconds < 0) {
        clearInterval(interval);
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        console.log();
        resolve();
      }
    }, 1000);
  });
}

async function delayRandomWithCountdown() {
  const delaySeconds = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
  await countdownWithMessage("Menunggu sebelum memproses wallet berikutnya", delaySeconds);
}

const configFilePath = './config.json';
let walletData = [];
if (fs.existsSync(configFilePath)) {
  walletData = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
}

function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  const walletDetails = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
  walletData.push(walletDetails);
  fs.writeFileSync(configFilePath, JSON.stringify(walletData, null, 2));
  return walletDetails;
}

async function verifyReferralCode(reffcode, agent = null) {
  const response = await fetch(verifyApiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ invite_code: reffcode }),
    agent: agent
  });
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  return response.json();
}

async function registerWallet(reffcode, walletAddress, agent = null) {
  const registerWalletApiUrl = `https://referralapi.layeredge.io/api/referral/register-wallet/${reffcode}`;
  const response = await fetch(registerWalletApiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ walletAddress }),
    agent: agent
  });
  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  return response.json();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

cfonts.say('NT Exhaust', {
  font: 'block',
  align: 'center',
  colors: ['cyan', 'magenta'],
  background: 'black',
  letterSpacing: 1,
  lineHeight: 1,
  space: true,
  maxLength: '0'
});
console.log(centerText("=== Telegram Channel : NT Exhaust ( @NTExhaust ) ===\n"));

rl.question(chalk.cyan('Gunakan proxy? (y/n): '), (useProxyAnswer) => {
  if (useProxyAnswer.toLowerCase() === 'y') {
    useProxy = true;
    if (fs.existsSync('proxy.txt')) {
      proxyList = fs.readFileSync('proxy.txt', 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line);
      if (proxyList.length === 0) {
        console.error(chalk.red('File proxy.txt ditemukan, tetapi tidak ada proxy yang valid.'));
        process.exit(1);
      }
      console.log(chalk.yellowBright(`[→] Proxy diaktifkan. ${proxyList.length} proxy ditemukan.`));
    } else {
      console.error(chalk.red('File proxy.txt tidak ditemukan.'));
      process.exit(1);
    }
  } else {
    console.log(chalk.yellowBright('[→] Proxy tidak digunakan.'));
  }

  rl.question(chalk.cyan('Enter referral code: '), (reffcode) => {
    rl.question(chalk.cyan('Enter number of wallets to create: '), async (loopCount) => {
      const count = parseInt(loopCount, 10);
      if (isNaN(count) || count <= 0) {
        console.error(chalk.red('[✖] Invalid number of wallets!'));
        rl.close();
        return;
      }
      console.log(chalk.yellowBright(`\n[→] Creating ${count} wallets one by one...\n`));

      for (let i = 0; i < count; i++) {
        console.log(chalk.yellow(`Processing wallet ${i + 1} of ${count}`));

        let agent = null;
        if (useProxy) {
          const chosenProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
          try {
            agent = getProxyAgent(chosenProxy);
            const publicIP = await getPublicIP(agent);
            if (publicIP) {
              console.log(chalk.blue(`Menggunakan IP: ${publicIP}`));
            } else {
              console.log(chalk.blue(`Menggunakan proxy: ${chosenProxy}`));
            }
          } catch (err) {
            console.error(chalk.red(`Error membuat proxy agent untuk ${chosenProxy}: ${err.message}`));
            continue;
          }
        }

        // Buat wallet baru terlebih dahulu, meskipun nantinya jika registrasi gagal, info wallet tetap tersimpan
        const walletDetails = createNewWallet();

        let success = false;
        const maxAttempts = 3;
        let attempts = 0;
        while (!success && attempts < maxAttempts) {
          attempts++;
          try {
            await verifyReferralCode(reffcode, agent);
            await registerWallet(reffcode, walletDetails.address, agent);
            console.log(chalk.green(`✅ Wallet ${i + 1} processed successfully on attempt ${attempts}!`));
            console.log(chalk.green(`✅ Informasi akun tersimpan di config.json`));
            console.log(chalk.green(`✅ Registrasi Akun Berhasil`));
            success = true;
          } catch (error) {
            console.error(chalk.red(`❌ Attempt ${attempts} failed for wallet ${i + 1}: ${error.message}`));
            if (attempts < maxAttempts) {
              console.log(chalk.yellow(`Retrying wallet ${i + 1}`));
              await countdownWithMessage(`Retrying wallet ${i + 1}`, 5);
            }
          }
        }
        if (!success) {
          console.error(chalk.red(`❌ Wallet ${i + 1} failed after ${maxAttempts} attempts. Skipping...`));
        }

        if (i < count - 1) {
          await delayRandomWithCountdown();
        }
      }

      console.log(chalk.greenBright('\n✅ Process completed!'));
      rl.close();
    });
  });
});
