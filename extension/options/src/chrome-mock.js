// Dev-only Chrome API mock — no-ops when real extension APIs are present.
// Imported conditionally in main.jsx during development.

const DEV_SETTINGS = {
  enabled: true, strictness: 'moderate',
  platforms: { x: true, reddit: true, instagram: true },
  thresholds: { Sexy: 0.7, Porn: 0.5, Hentai: 0.5, Drawing: 0.9 },
  actions: { Sexy: 'blur', Porn: 'blur', Hentai: 'blur' },
  skipSmallImages: true, smallImageThreshold: 100,
  checkVideoFrames: true, showFilteredCount: true,
  textFilterEnabled: false,
  textFilterCustomWords: [],
};

const getURL = (path) => '/' + path.split('/').at(-1);

const DEV_STATS = [
  { date: new Date(Date.now()-6*864e5).toISOString().split('T')[0], total:120, filtered:8,  textFiltered:0, byLabel:{Sexy:4,Porn:3,Hentai:1}, byPlatform:{x:5,reddit:2,instagram:1} },
  { date: new Date(Date.now()-5*864e5).toISOString().split('T')[0], total:95,  filtered:6,  textFiltered:1, byLabel:{Sexy:2,Porn:3,Hentai:1}, byPlatform:{x:3,reddit:2,instagram:1} },
  { date: new Date(Date.now()-4*864e5).toISOString().split('T')[0], total:143, filtered:12, textFiltered:2, byLabel:{Sexy:6,Porn:4,Hentai:2}, byPlatform:{x:7,reddit:3,instagram:2} },
  { date: new Date(Date.now()-3*864e5).toISOString().split('T')[0], total:88,  filtered:5,  textFiltered:0, byLabel:{Sexy:3,Porn:2,Hentai:0}, byPlatform:{x:4,reddit:1,instagram:0} },
  { date: new Date(Date.now()-2*864e5).toISOString().split('T')[0], total:167, filtered:19, textFiltered:3, byLabel:{Sexy:9,Porn:7,Hentai:3}, byPlatform:{x:10,reddit:6,instagram:3} },
  { date: new Date(Date.now()-1*864e5).toISOString().split('T')[0], total:201, filtered:24, textFiltered:5, byLabel:{Sexy:11,Porn:9,Hentai:4}, byPlatform:{x:13,reddit:7,instagram:4} },
  { date: new Date().toISOString().split('T')[0],                   total:134, filtered:15, textFiltered:2, byLabel:{Sexy:7,Porn:5,Hentai:3}, byPlatform:{x:8,reddit:4,instagram:3} },
];

if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = {
    storage: {
      local: {
        get: (key, cb) => { const d={settings:DEV_SETTINGS,stats:DEV_STATS,replacementImage:null}; if(Array.isArray(key)){const r={};key.forEach(k=>r[k]=d[k]);cb(r);}else if(typeof key==='string'){cb({[key]:d[key]});}else{cb(d);} },
        set: (_,cb) => { if(cb) cb(); },
        remove: (_,cb) => { if(cb) cb(); },
      },
      onChanged: { addListener:()=>{}, removeListener:()=>{} },
      sync: { get:(_,cb)=>cb({}), set:()=>{} },
    },
    runtime: {
      getManifest: () => ({ version: '0.2.5' }),
      getURL,
      sendMessage: (_,cb) => { if(cb) cb({}); },
      onMessage: { addListener:()=>{} },
      lastError: null,
    },
  };
}
