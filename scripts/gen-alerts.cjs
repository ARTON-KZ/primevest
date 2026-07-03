// One-off generator → writes public/js/alerts-data.js
// window.ALERTS = { deposits:[600], reinvestments:[600], withdrawals:[600] }
// Mirrors anthony invest's scripts/gen-testimonials.cjs approach.
const fs = require('fs');
const path = require('path');

const firstNames = [
  'Michael','Sarah','David','Emma','James','Olivia','Daniel','Sophia','Adebayo','Chidi','Wei','Mei','Carlos','Lucia','Ahmed','Fatima','Liam','Ava','Noah','Isabella',
  'Ethan','Mia','Lucas','Amelia','Mason','Charlotte','Logan','Harper','Elijah','Evelyn','Oliver','Abigail','Benjamin','Emily','Henry','Grace','Sebastian','Chloe','Jack','Zoe',
  'Ryan','Hannah','Nathan','Layla','Samuel','Aria','Andrew','Nora','Joshua','Ella','Tunde','Ngozi','Kwame','Amara','Ibrahim','Aisha','Diego','Valentina','Hiro','Yuki',
  'Sven','Astrid','Mateo','Camila','Omar','Leila','Raj','Priya','Sanjay','Anika','Pavel','Natasha','Kofi','Zara','Marco','Elena','Tobias','Freya','Felix','Maya',
  'Georg','Ines','Bram','Sanne','Aleksander','Kasia','Dmitri','Irina','Yusuf','Amina','Thabo','Lerato','Emeka','Funke','Jin','Hana','Minh','Linh','Arjun','Divya'
];
const lastInitials = 'ABCDEFGHIJKLMNOPRSTUVWYZ'.split('');
const locations = [
  'New York, USA','London, UK','Lagos, Nigeria','Toronto, Canada','Sydney, Australia','Berlin, Germany','Dubai, UAE','Singapore','Mumbai, India','São Paulo, Brazil',
  'Cape Town, South Africa','Nairobi, Kenya','Accra, Ghana','Manila, Philippines','Kuala Lumpur, Malaysia','Amsterdam, Netherlands','Madrid, Spain','Rome, Italy','Paris, France','Stockholm, Sweden',
  'Oslo, Norway','Dublin, Ireland','Auckland, New Zealand','Vancouver, Canada','Chicago, USA','Houston, USA','Miami, USA','Los Angeles, USA','Seattle, USA','Boston, USA',
  'Mexico City, Mexico','Buenos Aires, Argentina','Lima, Peru','Bogotá, Colombia','Cairo, Egypt','Istanbul, Turkey','Doha, Qatar','Riyadh, Saudi Arabia','Bangkok, Thailand','Jakarta, Indonesia',
  'Hong Kong','Tokyo, Japan','Seoul, South Korea','Lisbon, Portugal','Vienna, Austria','Zurich, Switzerland','Brussels, Belgium','Warsaw, Poland','Prague, Czechia','Helsinki, Finland',
  'Atlanta, USA','Dallas, USA','Denver, USA','Phoenix, USA','Austin, USA','Brisbane, Australia','Perth, Australia','Munich, Germany','Hamburg, Germany','Lyon, France',
  'Abuja, Nigeria','Port Harcourt, Nigeria','Johannesburg, South Africa','Kigali, Rwanda','Dar es Salaam, Tanzania','Kampala, Uganda','Casablanca, Morocco','Tunis, Tunisia','Kuwait City, Kuwait','Muscat, Oman'
];
const coins = ['BTC', 'ETH', 'USDT', 'BTC', 'USDT']; // weighted toward BTC/USDT

const pick = (arr, i) => arr[i % arr.length];
const initials = (name) => name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

// Deterministic-but-varied amount per type. Deposits skew mid, reinvestments
// smaller, withdrawals wider (big cash-outs sell the dream).
function amount(type, i) {
  if (type === 'deposit')      return 100 + ((i * 149) % 590) * 25;        // $100 – $14,850
  if (type === 'reinvestment') return 50  + ((i * 211) % 420) * 15;        // $50 – $6,335
  return 250 + ((i * 331) % 660) * 55;                                     // $250 – $36,495
}

function build(type, count, salt) {
  const out = [];
  const seen = new Set();
  let i = 0;
  while (out.length < count && i < 60000) {
    const name = `${pick(firstNames, i * 7 + salt)} ${pick(lastInitials, i * 3 + salt + 1)}.`;
    const loc = pick(locations, i * 5 + salt * 2);
    const amt = amount(type, i + salt);
    const coin = pick(coins, i + salt);
    const key = `${name}|${loc}|${amt}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ n: name, i: initials(name), l: loc, a: amt, c: coin });
    }
    i++;
  }
  return out;
}

const data = {
  deposits:      build('deposit', 600, 3),
  reinvestments: build('reinvestment', 600, 11),
  withdrawals:   build('withdrawal', 600, 7),
};

const header = `/* AUTO-GENERATED — ${data.deposits.length} deposit, ${data.reinvestments.length} reinvestment, ${data.withdrawals.length} withdrawal alerts. Regenerate with scripts/gen-alerts.cjs */\n`;
const body = `window.ALERTS = ${JSON.stringify(data)};\n`;
const dest = path.join(__dirname, '..', 'public', 'js', 'alerts-data.js');
fs.writeFileSync(dest, header + body);
console.log(`Wrote ${data.deposits.length}+${data.reinvestments.length}+${data.withdrawals.length} alerts → ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
