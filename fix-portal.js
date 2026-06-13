const fs = require('fs');
let content = fs.readFileSync('src/app/portal/[id]/page.tsx', 'utf-8');

content = content.replace(/\/\/ ─── Feedback Form ───[\s\S]*?(?=\/\/ ─── Main Portal Page ───)/, '');
content = content.replace(/,\s*\{\s*key:\s*'feedback',\s*label:\s*'Feedback',\s*icon:\s*MessageSquare\s*\}/, '');
content = content.replace(/const \[activeSection, setActiveSection\] = useState<'overview' \| 'releases' \| 'feedback'>\('overview'\);/, "const [activeSection, setActiveSection] = useState<'overview' | 'releases'>('overview');");
content = content.replace(/\/\/ ─── Projects module ───[\s\S]*?(?=\/\/ ─── Tasks module ───)/, '');
content = content.replace(/<p className="text-\[9px\] text-\[#6c5ce7\] font-bold uppercase tracking-\[0\.15em\]">\{data\.producerName \|\| 'EZY Studio'\}<\/p>\s*<h1 className="text-sm font-bold text-white leading-tight">Portal de \{data\.artist\.name\}<\/h1>/, `<p className="text-[9px] text-accent font-bold uppercase tracking-[0.15em]">Portal de</p>\n              <h1 className="text-lg font-bold text-text-primary leading-tight">{data.artist.name}</h1>`);

const map = {
  'bg-[#0a0a0f]': 'bg-background',
  'text-[#f0f0f5]': 'text-text-primary',
  'text-white': 'text-text-primary',
  'bg-[#13131a]': 'bg-surface',
  'border-white/8': 'border-border',
  'border-white/5': 'border-border',
  'border-white/10': 'border-border',
  'border-white/20': 'border-border',
  'border-white/30': 'border-border',
  'border-white/40': 'border-border',
  'border-white/50': 'border-border',
  'border-white/60': 'border-border',
  'border-white/80': 'border-border',
  'border-white/6': 'border-border',
  'border-white/12': 'border-border',
  'bg-white/5': 'bg-surface-elevated',
  'bg-white/10': 'bg-surface-elevated',
  'bg-[#0d0d14]/80': 'bg-surface/90',
  'text-[#8888a0]': 'text-text-secondary',
  'text-[#6c5ce7]': 'text-accent',
  'text-[#a29bfe]': 'text-accent-light',
  'bg-[#6c5ce7]': 'bg-accent',
  'bg-[#00b894]': 'bg-success',
  'text-[#00b894]': 'text-success',
  'text-[#fdcb6e]': 'text-warning'
};

for (const [dark, light] of Object.entries(map)) {
  content = content.split(dark).join(light);
}

fs.writeFileSync('src/app/portal/[id]/page.tsx', content);
console.log('Portal updated');
