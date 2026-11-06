// Data adapter. Words are compared exactly; no spelling normalization is applied.
function createQuiz(data, {start=1,end=100,count=20,order='random',excludeReview=false}={}) {
  if (![start,end,count].every(Number.isInteger) || start<1 || end>2400 || start>end || count<1) throw new Error('範囲または問題数が不正です');
  if (!['number','random'].includes(order)) throw new Error('出題順が不正です');
  const words=new Map(data.words.map(w=>[w.id,w]));
  const seen=new Set();
  let pool=data.entries.filter(e=>e.number>=start && e.number<=end && (!excludeReview || e.review_status!=='needs_review')).sort((a,b)=>a.number-b.number).filter(e=>{
    if(seen.has(e.word_id)) return false;
    seen.add(e.word_id); return true;
  }).map(e=>({...e,...words.get(e.word_id)}));
  if(count>pool.length) throw new Error(`範囲内の重複を除いた単語数は${pool.length}語です`);
  if(order==='random') for(let i=pool.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,count);
}
const ranges=Array.from({length:24},(_,i)=>({start:i*100+1,end:(i+1)*100}));
// Entire list is validated before mutating data. Unlisted entries remain unassessed.
function applyReviewList(data, reviews) {
  const byNumber=new Map(data.entries.map(e=>[e.number,e]));
  const byId=new Map(data.words.map(w=>[w.id,w]));
  const updates=reviews.map(r=>{
    const entry=byNumber.get(r.number);
    if(!entry || (r.word!==undefined && r.word!==byId.get(entry.word_id).word)) throw new Error(`要確認リストの番号・単語が一致しません: ${r.number}`);
    return {entry,note:r.note??null};
  });
  for(const {entry,note} of updates) {entry.review_status='needs_review';entry.review_note=note;}
  data.review_list_imported=true;
  return data;
}

const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,questions=[],meta='',hidden=false;const key='eiken-study-v1';
function applySaved(saved){if(!saved||!Array.isArray(saved.words)||!Array.isArray(saved.entries))throw Error('バックアップ形式が不正です');const words=new Map(data.words.map(w=>[w.id,w])),entries=new Map(data.entries.map(e=>[e.number,e]));for(const w of saved.words)if(!words.has(w.id)||words.get(w.id).word!==w.word||!(w.meaning_ja===null||typeof w.meaning_ja==='string'))throw Error('単語データが一致しません');for(const e of saved.entries)if(!entries.has(e.number)||!['unassessed','needs_review','confirmed'].includes(e.review_status))throw Error('確認情報が不正です');for(const w of saved.words){if(w.meaning_user_edited===true || (typeof w.meaning_ja==='string' && w.meaning_ja.trim())){words.get(w.id).meaning_ja=w.meaning_ja;words.get(w.id).meaning_user_edited=w.meaning_user_edited===true || !w.meaning_source;}words.get(w.id).weak=w.weak===true;}for(const e of saved.entries)if(e.review_status!=='unassessed')entries.get(e.number).review_status=e.review_status;}
function save(){try{localStorage.setItem(key,JSON.stringify(data));$('save-status').textContent='このブラウザーに保存しました。';}catch{$('save-status').textContent='ブラウザーに保存できません。バックアップ保存をご利用ください。';}}
function render(){for(const answer of [false,true]){const title=answer?'英単語テスト・解答':'英単語テスト';$(answer?'answers':'questions').innerHTML=`<h2>${title}</h2><div class="meta"><span>${esc(meta)}</span><span>${new Date().toLocaleDateString('ja-JP')}</span></div>${answer?'':'<div class="name">氏名 ____________________　得点 ____ / '+questions.length+'</div>'}<table><thead><tr><th>No.</th><th>英単語</th><th>日本語の意味</th></tr></thead><tbody>${questions.map((q,i)=>{const w=data.words.find(w=>w.id===q.word_id);return `<tr><td>${i+1}</td><td>${answer?esc(w.word):`<button type="button" class="word-toggle" data-reveal="${i}" aria-expanded="false" aria-controls="meaning-${i}" aria-label="${esc(w.word)}の訳を表示／非表示">${esc(w.word)}</button>`} <span class="num">${q.number}${q.review_status==='needs_review'?' ⚑':''}</span>${answer?'':`<label class="weak-row no-print"><input type="checkbox" data-weak="${w.id}" ${w.weak?'checked':''}>間違えた</label>`}</td><td>${answer?`<span class="answer">${esc(w.meaning_ja||(w.meaning_source==='pending_spelling_review'?'要確認：綴りを確認してください':'訳未登録'))}</span>`:`<input class="blank" aria-label="問${i+1}の解答"><div id="meaning-${i}" class="revealed-meaning no-print" hidden>${esc(w.meaning_ja||(w.meaning_source==='pending_spelling_review'?'要確認：綴りを確認してください':'訳未登録'))}</div>`}</td></tr>`}).join('')}</tbody></table><p class="footer">範囲内で同一単語の重複なし${answer?' ・ 一般的な意味に基づく学習用訳（教材の掲載訳とは異なります）。':''}</p>`;}}
function weakUI(){const weak=data.words.filter(w=>w.weak);$('weak-count').textContent=`保存した苦手単語：${weak.length}語`;$('weak-list').innerHTML=weak.length?weak.map(w=>`<label class="weak-row"><input type="checkbox" data-weak="${w.id}" checked>${esc(w.word)} <span class="muted">${data.entries.filter(e=>e.word_id===w.id).map(e=>e.number).join(' / ')}番</span></label>`).join(''):'まだありません。問題の「間違えた」にチェックしてください。';}
function generate(){try{const isWeak=$('mode').value==='weak',start=isWeak?1:+$('start').value,end=isWeak?2400:+$('end').value,count=+$('count').value;let source=data,actual=count;if(isWeak){const ids=new Set(data.words.filter(w=>w.weak).map(w=>w.id));source={...data,entries:data.entries.filter(e=>ids.has(e.word_id))};const eligible=source.entries.filter(e=>!$('exclude').checked||e.review_status!=='needs_review');actual=Math.min(count,new Set(eligible.map(e=>e.word_id)).size);if(!actual)throw Error('出題できる苦手単語がありません。問題にチェックを付けるか、OCR除外設定を確認してください。');}questions=createQuiz(source,{start,end,count:actual,order:$('order').value,excludeReview:$('exclude').checked});meta=`${isWeak?'苦手単語（全範囲）':`範囲 ${start}〜${end}`} / ${actual}問 / ${$('order').selectedOptions[0].text}`;render();weakUI();$('status').textContent=`${isWeak?'保存した苦手単語':`${start}〜${end}番`}から ${actual}問を生成しました。${actual<count?'（保存数に合わせて出題）':''}`;$('error').textContent='';}catch(e){$('error').textContent=e.message;}}
$('mode').onchange=()=>{for(const id of ['range','start','end'])$(id).disabled=$('mode').value==='weak';};
document.addEventListener('change',e=>{if(!e.target.matches('[data-weak]'))return;const id=+e.target.dataset.weak;data.words.find(w=>w.id===id).weak=e.target.checked;document.querySelectorAll(`[data-weak="${id}"]`).forEach(el=>el.checked=e.target.checked);save();$('weak-save').textContent=$('save-status').textContent;weakUI();});
function manager(){const r=ranges[+$('manage-range').value];const words=new Map(data.words.map(w=>[w.id,w]));$('manager').innerHTML='<table><thead><tr><th>番号</th><th>英単語 / 日本語訳</th><th>OCR確認</th></tr></thead><tbody>'+data.entries.filter(e=>e.number>=r.start&&e.number<=r.end).map(e=>{const w=words.get(e.word_id);return `<tr><td>${e.number}</td><td>${esc(w.word)}<input data-word="${w.id}" aria-label="${esc(w.word)}の日本語訳" value="${esc(w.meaning_ja||'')}" placeholder="日本語訳を追加"></td><td><select data-entry="${e.number}" aria-label="${e.number}番の確認状態">${[['unassessed','未判定'],['needs_review','要確認'],['confirmed','確認済み']].map(([v,t])=>`<option value="${v}" ${v===e.review_status?'selected':''}>${t}</option>`).join('')}</select></td></tr>`}).join('')+'</tbody></table>';}
$('form').onsubmit=e=>{e.preventDefault();generate();if(!$('error').textContent){if(e.submitter?.id==='start-cards')startCards(questions);else closeCards();}};$('range').onchange=()=>{const r=ranges[+$('range').value];$('start').value=r.start;$('end').value=r.end;};
$('toggle').onclick=()=>{hidden=!hidden;$('answer-wrap').hidden=hidden;$('toggle').textContent=hidden?'解答を表示':'解答を隠す';};
document.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>{document.body.className=b.dataset.print;$('answer-wrap').hidden=false;window.print();$('answer-wrap').hidden=hidden;document.body.className='';});
$('manage-range').onchange=manager;$('manager').onchange=e=>{if(e.target.dataset.word){const w=data.words.find(w=>w.id===+e.target.dataset.word);w.meaning_ja=e.target.value||null;w.meaning_user_edited=true;}if(e.target.dataset.entry)data.entries.find(x=>x.number===+e.target.dataset.entry).review_status=e.target.value;save();render();};
$('backup').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='eiken-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
$('restore').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;applySaved(JSON.parse(await f.text()));save();manager();render();weakUI();}catch(err){$('save-status').textContent=err.message;}e.target.value='';};
try{data={
  "schema_version": 1,
  "source": "eiken_codex_1_2400.csv",
  "review_list_imported": false,
  "words": [
    {
      "id": 1,
      "word": "squander",
      "meaning_ja": "浪費する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2,
      "word": "berate",
      "meaning_ja": "厳しく叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 3,
      "word": "extol",
      "meaning_ja": "激賞する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 4,
      "word": "petrify",
      "meaning_ja": "恐怖で動けなくする；石化させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 5,
      "word": "mesmerize",
      "meaning_ja": "魅了する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 6,
      "word": "appall",
      "meaning_ja": "ぞっとさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 7,
      "word": "quell",
      "meaning_ja": "鎮める；抑える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 8,
      "word": "fluctuate",
      "meaning_ja": "変動する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 9,
      "word": "allay",
      "meaning_ja": "和らげる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 10,
      "word": "ransack",
      "meaning_ja": "くまなく探して荒らす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 11,
      "word": "embellish",
      "meaning_ja": "飾る；話を脚色する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 12,
      "word": "stifle",
      "meaning_ja": "抑え込む；窒息させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 13,
      "word": "curtail",
      "meaning_ja": "削減する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 14,
      "word": "capitulate",
      "meaning_ja": "降伏する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 15,
      "word": "epitomize",
      "meaning_ja": "典型である；要約する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 16,
      "word": "denote",
      "meaning_ja": "示す；意味する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 17,
      "word": "rebuff",
      "meaning_ja": "拒絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 18,
      "word": "admonish",
      "meaning_ja": "忠告する；叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 19,
      "word": "recuperate",
      "meaning_ja": "回復する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 20,
      "word": "alienate",
      "meaning_ja": "疎外する；遠ざける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 21,
      "word": "ostracize",
      "meaning_ja": "仲間外れにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 22,
      "word": "disseminate",
      "meaning_ja": "広める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 23,
      "word": "huddle",
      "meaning_ja": "身を寄せ合う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 24,
      "word": "exonerate",
      "meaning_ja": "無罪を証明する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 25,
      "word": "entice",
      "meaning_ja": "誘い込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 26,
      "word": "contrive",
      "meaning_ja": "工夫して作る；企む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 27,
      "word": "chisel",
      "meaning_ja": "のみで彫る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 28,
      "word": "wane",
      "meaning_ja": "衰える；欠ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 29,
      "word": "circumvent",
      "meaning_ja": "回避する；迂回する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 30,
      "word": "disperse",
      "meaning_ja": "散らす；分散する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 31,
      "word": "revamp",
      "meaning_ja": "刷新する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 32,
      "word": "debunk",
      "meaning_ja": "誤りを暴く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 33,
      "word": "defuse",
      "meaning_ja": "緊張を和らげる；信管を外す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 34,
      "word": "indoctrinate",
      "meaning_ja": "思想を教え込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 35,
      "word": "feign",
      "meaning_ja": "ふりをする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 36,
      "word": "rout",
      "meaning_ja": "完敗させる；総崩れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 37,
      "word": "incision",
      "meaning_ja": "切開；切り込み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 38,
      "word": "rift",
      "meaning_ja": "亀裂；不和",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 39,
      "word": "feat",
      "meaning_ja": "偉業；離れ業",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 40,
      "word": "predicament",
      "meaning_ja": "苦境",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 41,
      "word": "eulogy",
      "meaning_ja": "追悼演説；賛辞",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 42,
      "word": "latitude",
      "meaning_ja": "緯度；裁量の幅",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 43,
      "word": "asylum",
      "meaning_ja": "避難所；亡命による保護",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 44,
      "word": "hindsight",
      "meaning_ja": "後知恵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 45,
      "word": "prognosis",
      "meaning_ja": "予後；予測",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 46,
      "word": "offshoot",
      "meaning_ja": "分派；派生物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 47,
      "word": "glut",
      "meaning_ja": "供給過剰",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 48,
      "word": "versatility",
      "meaning_ja": "多才さ；多用途性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 49,
      "word": "attire",
      "meaning_ja": "服装",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 50,
      "word": "pinnacle",
      "meaning_ja": "頂点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 51,
      "word": "respite",
      "meaning_ja": "一時的な休息",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 52,
      "word": "zenith",
      "meaning_ja": "絶頂；天頂",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 53,
      "word": "annotation",
      "meaning_ja": "注釈",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 54,
      "word": "cessation",
      "meaning_ja": "停止；中止",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 55,
      "word": "mayhem",
      "meaning_ja": "大混乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 56,
      "word": "propensity",
      "meaning_ja": "傾向；性癖",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 57,
      "word": "clamor",
      "meaning_ja": "騒ぎ；大声で要求する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 58,
      "word": "aversion",
      "meaning_ja": "嫌悪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 59,
      "word": "figment",
      "meaning_ja": "想像の産物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 60,
      "word": "bout",
      "meaning_ja": "一時的な発作；試合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 61,
      "word": "embargo",
      "meaning_ja": "禁輸",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 62,
      "word": "barrage",
      "meaning_ja": "集中砲火；質問などの殺到",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 63,
      "word": "remorse",
      "meaning_ja": "後悔；良心の呵責",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 64,
      "word": "affront",
      "meaning_ja": "侮辱；侮辱する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 65,
      "word": "exodus",
      "meaning_ja": "大量脱出",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 66,
      "word": "adept",
      "meaning_ja": "熟練した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 67,
      "word": "pristine",
      "meaning_ja": "汚れていない；原始のままの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 68,
      "word": "lucrative",
      "meaning_ja": "利益の大きい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 69,
      "word": "meticulous",
      "meaning_ja": "細部まで注意深い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 70,
      "word": "flimsy",
      "meaning_ja": "薄っぺらな；根拠の弱い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 71,
      "word": "detrimental",
      "meaning_ja": "有害な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 72,
      "word": "adroit",
      "meaning_ja": "器用な；巧みな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 73,
      "word": "contentious",
      "meaning_ja": "論争を招く；議論好きの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 74,
      "word": "insurmountable",
      "meaning_ja": "克服できない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 75,
      "word": "adamant",
      "meaning_ja": "断固とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 76,
      "word": "avid",
      "meaning_ja": "熱心な；貪欲な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 77,
      "word": "marginal",
      "meaning_ja": "わずかな；周辺の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 78,
      "word": "defunct",
      "meaning_ja": "もはや存在しない；廃止された",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 79,
      "word": "sporadic",
      "meaning_ja": "散発的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 80,
      "word": "frivolous",
      "meaning_ja": "軽薄な；取るに足らない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 81,
      "word": "lethargic",
      "meaning_ja": "無気力な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 82,
      "word": "caustic",
      "meaning_ja": "辛辣な；腐食性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 83,
      "word": "sedentary",
      "meaning_ja": "座りがちな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 84,
      "word": "pallid",
      "meaning_ja": "青白い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 85,
      "word": "salient",
      "meaning_ja": "際立った；重要な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 86,
      "word": "tenacious",
      "meaning_ja": "粘り強い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 87,
      "word": "immaculate",
      "meaning_ja": "汚れのない；非の打ち所のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 88,
      "word": "uncouth",
      "meaning_ja": "無作法な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 89,
      "word": "gregarious",
      "meaning_ja": "社交的な；群居性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 90,
      "word": "emaciated",
      "meaning_ja": "やせ衰えた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 91,
      "word": "lavish",
      "meaning_ja": "豪華な；惜しみなく与える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 92,
      "word": "mediocre",
      "meaning_ja": "平凡な；並以下の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 93,
      "word": "arbitrary",
      "meaning_ja": "恣意的な；独断的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 94,
      "word": "benign",
      "meaning_ja": "温和な；良性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 95,
      "word": "facetious",
      "meaning_ja": "ふざけた；不真面目な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 96,
      "word": "demure",
      "meaning_ja": "控えめな；慎み深い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 97,
      "word": "inscrutable",
      "meaning_ja": "不可解な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 98,
      "word": "precarious",
      "meaning_ja": "不安定な；危険な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 99,
      "word": "hereditary",
      "meaning_ja": "遺伝性の；世襲の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 100,
      "word": "blatantly",
      "meaning_ja": "露骨に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 101,
      "word": "lambaste",
      "meaning_ja": "こっぴどく批判する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 102,
      "word": "renege",
      "meaning_ja": "約束を破る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 103,
      "word": "dwindle",
      "meaning_ja": "次第に減少する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 104,
      "word": "reprimand",
      "meaning_ja": "叱責する；叱責",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 105,
      "word": "inculcate",
      "meaning_ja": "教え込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 106,
      "word": "refute",
      "meaning_ja": "反論する；誤りを証明する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 107,
      "word": "corroborate",
      "meaning_ja": "裏付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 108,
      "word": "secede",
      "meaning_ja": "脱退する；分離独立する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 109,
      "word": "plummet",
      "meaning_ja": "急落する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 110,
      "word": "veer",
      "meaning_ja": "急に方向を変える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 111,
      "word": "delude",
      "meaning_ja": "欺く；思い違いをさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 112,
      "word": "divulge",
      "meaning_ja": "秘密を漏らす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 113,
      "word": "commiserate",
      "meaning_ja": "同情する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 114,
      "word": "flout",
      "meaning_ja": "公然と無視する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 115,
      "word": "besiege",
      "meaning_ja": "包囲する；殺到する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 116,
      "word": "override",
      "meaning_ja": "覆す；優先する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 117,
      "word": "succumb",
      "meaning_ja": "屈する；病気で死ぬ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 118,
      "word": "plague",
      "meaning_ja": "苦しめる；疫病",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 119,
      "word": "eclipse",
      "meaning_ja": "覆い隠す；しのぐ；食",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 120,
      "word": "lurk",
      "meaning_ja": "潜む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 121,
      "word": "incur",
      "meaning_ja": "損失などを被る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 122,
      "word": "bask",
      "meaning_ja": "日光などを浴びる；恩恵に浸る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 123,
      "word": "tout",
      "meaning_ja": "盛んに宣伝する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 124,
      "word": "encrypt",
      "meaning_ja": "暗号化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 125,
      "word": "pique",
      "meaning_ja": "興味をかき立てる；腹を立てること",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 126,
      "word": "meddle",
      "meaning_ja": "干渉する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 127,
      "word": "plunder",
      "meaning_ja": "略奪する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 128,
      "word": "broach",
      "meaning_ja": "話題を切り出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 129,
      "word": "embezzle",
      "meaning_ja": "横領する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 130,
      "word": "rebut",
      "meaning_ja": "反駁する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 131,
      "word": "liquidate",
      "meaning_ja": "清算する；換金する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 132,
      "word": "frisk",
      "meaning_ja": "身体検査をする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 133,
      "word": "budge",
      "meaning_ja": "少し動く；譲歩する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 134,
      "word": "recoup",
      "meaning_ja": "取り戻す；損失を埋め合わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 135,
      "word": "allude",
      "meaning_ja": "それとなく言及する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 136,
      "word": "nudge",
      "meaning_ja": "軽く突く；そっと促す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 137,
      "word": "garner",
      "meaning_ja": "集める；獲得する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 138,
      "word": "burgeon",
      "meaning_ja": "急速に発展する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 139,
      "word": "catalyst",
      "meaning_ja": "触媒；変化を促すもの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 140,
      "word": "clout",
      "meaning_ja": "影響力",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 141,
      "word": "fallacy",
      "meaning_ja": "誤った考え；誤謬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 142,
      "word": "quandary",
      "meaning_ja": "困惑；板挟み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 143,
      "word": "commotion",
      "meaning_ja": "騒動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 144,
      "word": "consternation",
      "meaning_ja": "驚愕；狼狽",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 145,
      "word": "litany",
      "meaning_ja": "長々とした列挙；連祷",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 146,
      "word": "fiasco",
      "meaning_ja": "大失敗",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 147,
      "word": "fruition",
      "meaning_ja": "実現；結実",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 148,
      "word": "perk",
      "meaning_ja": "特典；役得",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 149,
      "word": "culprit",
      "meaning_ja": "犯人；原因",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 150,
      "word": "deference",
      "meaning_ja": "敬意；恭順",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 151,
      "word": "demise",
      "meaning_ja": "終焉；死",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 152,
      "word": "rapport",
      "meaning_ja": "親密な関係",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 153,
      "word": "fugitive",
      "meaning_ja": "逃亡者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 154,
      "word": "concussion",
      "meaning_ja": "脳震盪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 155,
      "word": "retaliation",
      "meaning_ja": "報復",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 156,
      "word": "anesthetic",
      "meaning_ja": "麻酔薬；麻酔の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 157,
      "word": "brunt",
      "meaning_ja": "攻撃などの矢面",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 158,
      "word": "caliber",
      "meaning_ja": "能力の程度；口径",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 159,
      "word": "precursor",
      "meaning_ja": "先駆者；前兆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 160,
      "word": "knack",
      "meaning_ja": "こつ；才能",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 161,
      "word": "foliage",
      "meaning_ja": "葉；葉の茂み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 162,
      "word": "contingency",
      "meaning_ja": "不測の事態",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 163,
      "word": "scruple",
      "meaning_ja": "良心のとがめ；ためらい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 164,
      "word": "immunity",
      "meaning_ja": "免疫；免除",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 165,
      "word": "repercussion",
      "meaning_ja": "波及的影響",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 166,
      "word": "misgiving",
      "meaning_ja": "不安；疑念",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 167,
      "word": "farce",
      "meaning_ja": "茶番；笑劇",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 168,
      "word": "animosity",
      "meaning_ja": "敵意",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 169,
      "word": "rationale",
      "meaning_ja": "理論的根拠",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 170,
      "word": "grievance",
      "meaning_ja": "不満；苦情",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 171,
      "word": "glitch",
      "meaning_ja": "小さな不具合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 172,
      "word": "impunity",
      "meaning_ja": "処罰を免れること",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 173,
      "word": "adherent",
      "meaning_ja": "支持者；信奉者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 174,
      "word": "misnomer",
      "meaning_ja": "誤った名称",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 175,
      "word": "backlog",
      "meaning_ja": "未処理の仕事",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 176,
      "word": "abject",
      "meaning_ja": "悲惨な；卑屈な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 177,
      "word": "ulterior",
      "meaning_ja": "隠された；裏の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 178,
      "word": "aloof",
      "meaning_ja": "よそよそしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 179,
      "word": "incoherent",
      "meaning_ja": "支離滅裂な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 180,
      "word": "flagrant",
      "meaning_ja": "目に余る；甚だしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 181,
      "word": "brazen",
      "meaning_ja": "厚かましい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 182,
      "word": "engrossed",
      "meaning_ja": "夢中になった",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 183,
      "word": "mundane",
      "meaning_ja": "ありふれた；日常の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 184,
      "word": "oblivious",
      "meaning_ja": "気付かない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 185,
      "word": "interim",
      "meaning_ja": "暫定的な；中間の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 186,
      "word": "destitute",
      "meaning_ja": "極貧の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 187,
      "word": "altruistic",
      "meaning_ja": "利他的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 188,
      "word": "drab",
      "meaning_ja": "単調でつまらない；くすんだ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 189,
      "word": "obtrusive",
      "meaning_ja": "目障りな；出しゃばりな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 190,
      "word": "reclusive",
      "meaning_ja": "世間を避けた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 191,
      "word": "unscathed",
      "meaning_ja": "無傷の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 192,
      "word": "preemptive",
      "meaning_ja": "先制の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 193,
      "word": "belligerent",
      "meaning_ja": "好戦的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 194,
      "word": "frugal",
      "meaning_ja": "倹約的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 195,
      "word": "archaic",
      "meaning_ja": "古風な；廃れた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 196,
      "word": "clandestine",
      "meaning_ja": "秘密裏の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 197,
      "word": "equitable",
      "meaning_ja": "公平な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 198,
      "word": "reminiscent",
      "meaning_ja": "思い出させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 199,
      "word": "inadvertently",
      "meaning_ja": "不注意で；うっかり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 200,
      "word": "irreparably",
      "meaning_ja": "修復できないほど",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 201,
      "word": "interject",
      "meaning_ja": "口を挟む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 202,
      "word": "apprehend",
      "meaning_ja": "逮捕する；理解する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 203,
      "word": "plagiarize",
      "meaning_ja": "盗用する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 204,
      "word": "subvert",
      "meaning_ja": "転覆させる；覆す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 205,
      "word": "savor",
      "meaning_ja": "味わう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 206,
      "word": "culminate",
      "meaning_ja": "最高潮に達する；結果として至る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 207,
      "word": "salvage",
      "meaning_ja": "救出する；回収する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 208,
      "word": "vie",
      "meaning_ja": "競う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 209,
      "word": "bequeath",
      "meaning_ja": "遺贈する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 210,
      "word": "languish",
      "meaning_ja": "衰弱する；不遇に暮らす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 211,
      "word": "infest",
      "meaning_ja": "害虫などがはびこる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 212,
      "word": "ambush",
      "meaning_ja": "待ち伏せする；待ち伏せ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 213,
      "word": "placate",
      "meaning_ja": "なだめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 214,
      "word": "abate",
      "meaning_ja": "弱まる；和らげる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 215,
      "word": "invoke",
      "meaning_ja": "援用する；呼び起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 216,
      "word": "rebuke",
      "meaning_ja": "叱責する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 217,
      "word": "deviate",
      "meaning_ja": "逸脱する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 218,
      "word": "tarnish",
      "meaning_ja": "評判を傷つける；曇らせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 219,
      "word": "exasperate",
      "meaning_ja": "ひどくいら立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 220,
      "word": "emulate",
      "meaning_ja": "見習う；競ってまねる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 221,
      "word": "exude",
      "meaning_ja": "にじみ出る；醸し出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 222,
      "word": "annex",
      "meaning_ja": "併合する；別館",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 223,
      "word": "infer",
      "meaning_ja": "推論する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 224,
      "word": "dissipate",
      "meaning_ja": "散らす；消散する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 225,
      "word": "hamper",
      "meaning_ja": "妨げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 226,
      "word": "hatch",
      "meaning_ja": "孵化する；計画を企てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 227,
      "word": "bolster",
      "meaning_ja": "強化する；支える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 228,
      "word": "eschew",
      "meaning_ja": "避ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 229,
      "word": "extricate",
      "meaning_ja": "窮地から救い出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 230,
      "word": "muster",
      "meaning_ja": "集める；勇気を奮い起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 231,
      "word": "encapsulate",
      "meaning_ja": "要約する；包み込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 232,
      "word": "forfeit",
      "meaning_ja": "没収される；失う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 233,
      "word": "torment",
      "meaning_ja": "苦しめる；苦痛",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 234,
      "word": "augment",
      "meaning_ja": "増大させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 235,
      "word": "alleviate",
      "meaning_ja": "軽減する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 236,
      "word": "reiterate",
      "meaning_ja": "繰り返し述べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 237,
      "word": "accost",
      "meaning_ja": "近寄って声をかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 238,
      "word": "implore",
      "meaning_ja": "懇願する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 239,
      "word": "conjure",
      "meaning_ja": "魔法で呼び出す；思い起こさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 240,
      "word": "pilfer",
      "meaning_ja": "少しずつ盗む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 241,
      "word": "propel",
      "meaning_ja": "推進する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 242,
      "word": "retort",
      "meaning_ja": "言い返す；応酬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 243,
      "word": "camaraderie",
      "meaning_ja": "仲間意識",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 244,
      "word": "accomplice",
      "meaning_ja": "共犯者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 245,
      "word": "feud",
      "meaning_ja": "長年の確執",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 246,
      "word": "vicinity",
      "meaning_ja": "近辺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 247,
      "word": "reconnaissance",
      "meaning_ja": "偵察",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 248,
      "word": "conflagration",
      "meaning_ja": "大火災",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 249,
      "word": "ramification",
      "meaning_ja": "派生する影響；分岐",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 250,
      "word": "connoisseur",
      "meaning_ja": "鑑識眼のある人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 251,
      "word": "enmity",
      "meaning_ja": "敵意；憎悪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 252,
      "word": "gall",
      "meaning_ja": "厚かましさ；いら立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 253,
      "word": "conjecture",
      "meaning_ja": "推測",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 254,
      "word": "solace",
      "meaning_ja": "慰め",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 255,
      "word": "accolade",
      "meaning_ja": "称賛；栄誉",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 256,
      "word": "referendum",
      "meaning_ja": "国民投票",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 257,
      "word": "caricature",
      "meaning_ja": "風刺画；誇張した描写",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 258,
      "word": "prodigy",
      "meaning_ja": "神童",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 259,
      "word": "deluge",
      "meaning_ja": "大洪水；殺到",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 260,
      "word": "compunction",
      "meaning_ja": "良心の呵責",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 261,
      "word": "clique",
      "meaning_ja": "排他的な小集団",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 262,
      "word": "sustenance",
      "meaning_ja": "食料；生計の維持",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 263,
      "word": "debacle",
      "meaning_ja": "大失敗；崩壊",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 264,
      "word": "vent",
      "meaning_ja": "感情を発散する；通気口",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 265,
      "word": "valiant",
      "meaning_ja": "勇敢な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 266,
      "word": "ardent",
      "meaning_ja": "熱烈な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 267,
      "word": "cavalier",
      "meaning_ja": "無頓着な；横柄な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 268,
      "word": "incontrovertible",
      "meaning_ja": "議論の余地のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 269,
      "word": "brash",
      "meaning_ja": "無鉄砲な；厚かましい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 270,
      "word": "disheveled",
      "meaning_ja": "髪や服が乱れた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 271,
      "word": "grueling",
      "meaning_ja": "非常にきつい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 272,
      "word": "excruciating",
      "meaning_ja": "耐え難く痛い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 273,
      "word": "impending",
      "meaning_ja": "差し迫った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 274,
      "word": "infatuated",
      "meaning_ja": "夢中になった；のぼせ上がった",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 275,
      "word": "gullible",
      "meaning_ja": "だまされやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 276,
      "word": "irate",
      "meaning_ja": "激怒した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 277,
      "word": "malleable",
      "meaning_ja": "形を変えやすい；影響されやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 278,
      "word": "nonchalant",
      "meaning_ja": "平然とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 279,
      "word": "fervent",
      "meaning_ja": "熱烈な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 280,
      "word": "verbose",
      "meaning_ja": "冗長な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 281,
      "word": "quaint",
      "meaning_ja": "趣のある；風変わりな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 282,
      "word": "exquisite",
      "meaning_ja": "非常に美しい；精巧な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 283,
      "word": "erratic",
      "meaning_ja": "不規則な；気まぐれな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 284,
      "word": "somber",
      "meaning_ja": "陰気な；厳粛な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 285,
      "word": "untenable",
      "meaning_ja": "擁護できない；維持できない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 286,
      "word": "squeamish",
      "meaning_ja": "気分が悪くなりやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 287,
      "word": "paltry",
      "meaning_ja": "わずかな；取るに足らない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 288,
      "word": "pedantic",
      "meaning_ja": "学者ぶった；細部にこだわる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 289,
      "word": "fastidious",
      "meaning_ja": "好みがうるさい；几帳面な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 290,
      "word": "poignant",
      "meaning_ja": "心を強く打つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 291,
      "word": "staunch",
      "meaning_ja": "忠実な；断固とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 292,
      "word": "idyllic",
      "meaning_ja": "牧歌的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 293,
      "word": "candid",
      "meaning_ja": "率直な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 294,
      "word": "murky",
      "meaning_ja": "暗く濁った；不明瞭な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 295,
      "word": "pungent",
      "meaning_ja": "刺激臭のある；辛辣な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 296,
      "word": "auspicious",
      "meaning_ja": "幸先のよい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 297,
      "word": "menial",
      "meaning_ja": "単純で低く見られがちな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 298,
      "word": "resplendent",
      "meaning_ja": "光り輝く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 299,
      "word": "tepid",
      "meaning_ja": "ぬるい；熱意のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 300,
      "word": "overt",
      "meaning_ja": "公然の；明白な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 301,
      "word": "polarize",
      "meaning_ja": "二極化させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 302,
      "word": "baffle",
      "meaning_ja": "困惑させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 303,
      "word": "douse",
      "meaning_ja": "水を浴びせる；火を消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 304,
      "word": "incarcerate",
      "meaning_ja": "投獄する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 305,
      "word": "vindicate",
      "meaning_ja": "正しさを証明する；汚名をそそぐ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 306,
      "word": "vacillate",
      "meaning_ja": "ためらう；揺れ動く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 307,
      "word": "insinuate",
      "meaning_ja": "ほのめかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 308,
      "word": "covet",
      "meaning_ja": "切望する；むやみに欲しがる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 309,
      "word": "mollify",
      "meaning_ja": "なだめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 310,
      "word": "procrastinate",
      "meaning_ja": "先延ばしする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 311,
      "word": "incapacitate",
      "meaning_ja": "能力を奪う；動けなくする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 312,
      "word": "thwart",
      "meaning_ja": "阻止する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 313,
      "word": "smother",
      "meaning_ja": "窒息させる；覆い尽くす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 314,
      "word": "permeate",
      "meaning_ja": "浸透する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 315,
      "word": "inundate",
      "meaning_ja": "殺到する；水浸しにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 316,
      "word": "quench",
      "meaning_ja": "渇きを癒やす；火を消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 317,
      "word": "mortify",
      "meaning_ja": "ひどく恥ずかしい思いをさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 318,
      "word": "dispel",
      "meaning_ja": "払いのける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 319,
      "word": "pamper",
      "meaning_ja": "甘やかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 320,
      "word": "dawdle",
      "meaning_ja": "ぐずぐずする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 321,
      "word": "relegate",
      "meaning_ja": "格下げする；追いやる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 322,
      "word": "scrawl",
      "meaning_ja": "走り書きする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 323,
      "word": "lurch",
      "meaning_ja": "よろめく；急に傾く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 324,
      "word": "disband",
      "meaning_ja": "解散する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 325,
      "word": "procure",
      "meaning_ja": "調達する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 326,
      "word": "heave",
      "meaning_ja": "力を込めて持ち上げる；うねる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 327,
      "word": "hoard",
      "meaning_ja": "ため込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 328,
      "word": "adorn",
      "meaning_ja": "飾る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 329,
      "word": "astound",
      "meaning_ja": "仰天させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 330,
      "word": "substantiate",
      "meaning_ja": "立証する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 331,
      "word": "bestow",
      "meaning_ja": "授ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 332,
      "word": "consecrate",
      "meaning_ja": "神聖なものにする；捧げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 333,
      "word": "absolve",
      "meaning_ja": "罪を免除する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 334,
      "word": "engender",
      "meaning_ja": "生じさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 335,
      "word": "exacerbate",
      "meaning_ja": "悪化させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 336,
      "word": "demean",
      "meaning_ja": "品位を落とす；侮辱する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 337,
      "word": "revile",
      "meaning_ja": "ののしる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 338,
      "word": "straddle",
      "meaning_ja": "またがる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 339,
      "word": "encumber",
      "meaning_ja": "妨げる；負担をかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 340,
      "word": "imbue",
      "meaning_ja": "感情などを吹き込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 341,
      "word": "forge",
      "meaning_ja": "偽造する；築く；鍛造する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 342,
      "word": "intercept",
      "meaning_ja": "途中で止める；傍受する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 343,
      "word": "rummage",
      "meaning_ja": "かき回して探す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 344,
      "word": "detract",
      "meaning_ja": "価値を減じる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 345,
      "word": "repudiate",
      "meaning_ja": "否認する；拒絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 346,
      "word": "disdain",
      "meaning_ja": "軽蔑する；軽蔑",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 347,
      "word": "bigotry",
      "meaning_ja": "偏狭さ；偏見",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 348,
      "word": "prowess",
      "meaning_ja": "優れた技能；武勇",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 349,
      "word": "turmoil",
      "meaning_ja": "混乱；騒乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 350,
      "word": "morale",
      "meaning_ja": "士気",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 351,
      "word": "boon",
      "meaning_ja": "恩恵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 352,
      "word": "diatribe",
      "meaning_ja": "痛烈な非難",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 353,
      "word": "acquittal",
      "meaning_ja": "無罪判決",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 354,
      "word": "homage",
      "meaning_ja": "敬意",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 355,
      "word": "rubble",
      "meaning_ja": "がれき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 356,
      "word": "echelon",
      "meaning_ja": "階層；階級",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 357,
      "word": "gist",
      "meaning_ja": "要点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 358,
      "word": "brevity",
      "meaning_ja": "簡潔さ；短さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 359,
      "word": "condolence",
      "meaning_ja": "お悔やみ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 360,
      "word": "penchant",
      "meaning_ja": "強い好み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 361,
      "word": "charlatan",
      "meaning_ja": "いかさま師",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 362,
      "word": "blemish",
      "meaning_ja": "傷；欠点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 363,
      "word": "reparation",
      "meaning_ja": "賠償；修復",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 364,
      "word": "gorge",
      "meaning_ja": "峡谷；がつがつ食べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 365,
      "word": "rampage",
      "meaning_ja": "暴れ回る；暴動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 366,
      "word": "annulment",
      "meaning_ja": "無効化；取り消し",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 367,
      "word": "impasse",
      "meaning_ja": "行き詰まり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 368,
      "word": "fidelity",
      "meaning_ja": "忠実；正確さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 369,
      "word": "diffident",
      "meaning_ja": "自信のない；遠慮がちな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 370,
      "word": "abridged",
      "meaning_ja": "要約された；短縮された",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 371,
      "word": "dainty",
      "meaning_ja": "小さく上品な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 372,
      "word": "dilapidated",
      "meaning_ja": "荒れ果てた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 373,
      "word": "profound",
      "meaning_ja": "深遠な；深い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 374,
      "word": "imperative",
      "meaning_ja": "不可欠な；命令的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 375,
      "word": "elusive",
      "meaning_ja": "捕らえにくい；理解しにくい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 376,
      "word": "capricious",
      "meaning_ja": "気まぐれな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 377,
      "word": "endemic",
      "meaning_ja": "特定地域に固有の；蔓延した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 378,
      "word": "frigid",
      "meaning_ja": "極寒の；冷淡な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 379,
      "word": "docile",
      "meaning_ja": "従順な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 380,
      "word": "frenetic",
      "meaning_ja": "熱狂的な；大慌ての",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 381,
      "word": "despondent",
      "meaning_ja": "落胆した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 382,
      "word": "lurid",
      "meaning_ja": "どぎつい；衝撃的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 383,
      "word": "presumptuous",
      "meaning_ja": "厚かましい；おこがましい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 384,
      "word": "buoyant",
      "meaning_ja": "浮力のある；快活な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 385,
      "word": "conducive",
      "meaning_ja": "役立つ；促進する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 386,
      "word": "stagnant",
      "meaning_ja": "停滞した；よどんだ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 387,
      "word": "culpable",
      "meaning_ja": "非難されるべき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 388,
      "word": "placid",
      "meaning_ja": "穏やかな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 389,
      "word": "erroneous",
      "meaning_ja": "誤った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 390,
      "word": "ambivalent",
      "meaning_ja": "相反する感情を持つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 391,
      "word": "impervious",
      "meaning_ja": "影響されない；通さない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 392,
      "word": "succinct",
      "meaning_ja": "簡潔な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 393,
      "word": "palatable",
      "meaning_ja": "口に合う；受け入れられる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 394,
      "word": "exorbitant",
      "meaning_ja": "法外な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 395,
      "word": "exuberant",
      "meaning_ja": "活気にあふれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 396,
      "word": "tantamount",
      "meaning_ja": "同然の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 397,
      "word": "cumbersome",
      "meaning_ja": "扱いにくい；かさばる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 398,
      "word": "delinquent",
      "meaning_ja": "非行の；滞納している",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 399,
      "word": "antagonistic",
      "meaning_ja": "敵対的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 400,
      "word": "haphazardly",
      "meaning_ja": "行き当たりばったりに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 401,
      "word": "confiscate",
      "meaning_ja": "没収する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 402,
      "word": "bemoan",
      "meaning_ja": "嘆く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 403,
      "word": "denigrate",
      "meaning_ja": "けなす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 404,
      "word": "wince",
      "meaning_ja": "痛みで顔をしかめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 405,
      "word": "assuage",
      "meaning_ja": "和らげる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 406,
      "word": "accrue",
      "meaning_ja": "蓄積する；生じる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 407,
      "word": "connive",
      "meaning_ja": "共謀する；見て見ぬふりをする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 408,
      "word": "transpire",
      "meaning_ja": "起こる；明らかになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 409,
      "word": "fret",
      "meaning_ja": "思い悩む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 410,
      "word": "pander",
      "meaning_ja": "欲望に迎合する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 411,
      "word": "flounder",
      "meaning_ja": "もがく；まごつく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 412,
      "word": "elude",
      "meaning_ja": "逃れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 413,
      "word": "deduce",
      "meaning_ja": "演繹する；推論する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 414,
      "word": "decimate",
      "meaning_ja": "大幅に減らす；壊滅させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 415,
      "word": "teeter",
      "meaning_ja": "ぐらつく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 416,
      "word": "shun",
      "meaning_ja": "避ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 417,
      "word": "coax",
      "meaning_ja": "なだめて説得する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 418,
      "word": "dissuade",
      "meaning_ja": "思いとどまらせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 419,
      "word": "instill",
      "meaning_ja": "徐々に植え付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 420,
      "word": "exhort",
      "meaning_ja": "強く勧める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 421,
      "word": "peruse",
      "meaning_ja": "熟読する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 422,
      "word": "repel",
      "meaning_ja": "撃退する；嫌悪を抱かせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 423,
      "word": "purge",
      "meaning_ja": "除去する；粛清する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 424,
      "word": "abscond",
      "meaning_ja": "持ち逃げする；逃亡する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 425,
      "word": "swerve",
      "meaning_ja": "急にそれる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 426,
      "word": "meander",
      "meaning_ja": "曲がりくねる；漫然と進む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 427,
      "word": "grapple",
      "meaning_ja": "取り組む；取っ組み合う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 428,
      "word": "prod",
      "meaning_ja": "突く；促す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 429,
      "word": "dangle",
      "meaning_ja": "ぶら下がる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 430,
      "word": "perpetrate",
      "meaning_ja": "犯罪を犯す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 431,
      "word": "traverse",
      "meaning_ja": "横断する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 432,
      "word": "blur",
      "meaning_ja": "ぼやけさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 433,
      "word": "dislodge",
      "meaning_ja": "取り除く；追い出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 434,
      "word": "infraction",
      "meaning_ja": "違反",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 435,
      "word": "lesion",
      "meaning_ja": "病変；損傷",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 436,
      "word": "hermit",
      "meaning_ja": "隠者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 437,
      "word": "ultimatum",
      "meaning_ja": "最後通告",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 438,
      "word": "truce",
      "meaning_ja": "休戦",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 439,
      "word": "twinge",
      "meaning_ja": "鋭い痛み；良心の痛み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 440,
      "word": "stint",
      "meaning_ja": "一定期間の仕事；出し惜しむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 441,
      "word": "vigil",
      "meaning_ja": "徹夜の見守り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 442,
      "word": "wrath",
      "meaning_ja": "激怒",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 443,
      "word": "ember",
      "meaning_ja": "燃えさし",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 444,
      "word": "premium",
      "meaning_ja": "保険料；割増金；上質の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 445,
      "word": "concession",
      "meaning_ja": "譲歩；特許権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 446,
      "word": "brawl",
      "meaning_ja": "乱闘",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 447,
      "word": "debris",
      "meaning_ja": "破片；がれき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 448,
      "word": "hassle",
      "meaning_ja": "面倒；煩わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 449,
      "word": "inception",
      "meaning_ja": "始まり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 450,
      "word": "reprisal",
      "meaning_ja": "報復",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 451,
      "word": "innuendo",
      "meaning_ja": "当てこすり；ほのめかし",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 452,
      "word": "impediment",
      "meaning_ja": "障害",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 453,
      "word": "stake",
      "meaning_ja": "利害関係；賭け金；杭",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 454,
      "word": "imposition",
      "meaning_ja": "押し付け；課税",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 455,
      "word": "retention",
      "meaning_ja": "保持",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 456,
      "word": "resurgence",
      "meaning_ja": "復活；再燃",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 457,
      "word": "cinch",
      "meaning_ja": "容易なこと；確実なこと",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 458,
      "word": "throng",
      "meaning_ja": "群衆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 459,
      "word": "complexion",
      "meaning_ja": "顔色；様相",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 460,
      "word": "blunder",
      "meaning_ja": "大失敗；大失敗する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 461,
      "word": "consort",
      "meaning_ja": "交際する；配偶者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 462,
      "word": "requisite",
      "meaning_ja": "必要なもの；必要な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 463,
      "word": "cryptic",
      "meaning_ja": "謎めいた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 464,
      "word": "reprehensible",
      "meaning_ja": "非難に値する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 465,
      "word": "prolific",
      "meaning_ja": "多作の；多産の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 466,
      "word": "discerning",
      "meaning_ja": "識別力のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 467,
      "word": "precocious",
      "meaning_ja": "早熟な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 468,
      "word": "tantalizing",
      "meaning_ja": "じれったいほど魅力的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 469,
      "word": "unkempt",
      "meaning_ja": "身なりがだらしない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 470,
      "word": "fickle",
      "meaning_ja": "気まぐれな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 471,
      "word": "acrid",
      "meaning_ja": "刺激臭のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 472,
      "word": "jaded",
      "meaning_ja": "疲れ切った；飽き飽きした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 473,
      "word": "plausible",
      "meaning_ja": "もっともらしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 474,
      "word": "rudimentary",
      "meaning_ja": "初歩的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 475,
      "word": "banal",
      "meaning_ja": "陳腐な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 476,
      "word": "eligible",
      "meaning_ja": "資格のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 477,
      "word": "transient",
      "meaning_ja": "一時的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 478,
      "word": "chronic",
      "meaning_ja": "慢性的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 479,
      "word": "indelible",
      "meaning_ja": "消せない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 480,
      "word": "robust",
      "meaning_ja": "頑健な；力強い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 481,
      "word": "derelict",
      "meaning_ja": "遺棄された；義務を怠った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 482,
      "word": "exemplary",
      "meaning_ja": "模範的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 483,
      "word": "incremental",
      "meaning_ja": "徐々に増える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 484,
      "word": "opulent",
      "meaning_ja": "豪華な；裕福な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 485,
      "word": "pertinent",
      "meaning_ja": "関連する；適切な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 486,
      "word": "sleek",
      "meaning_ja": "滑らかな；洗練された",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 487,
      "word": "deplorable",
      "meaning_ja": "嘆かわしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 488,
      "word": "perennial",
      "meaning_ja": "多年生の；絶え間ない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 489,
      "word": "treacherous",
      "meaning_ja": "裏切りの；危険な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 490,
      "word": "disparate",
      "meaning_ja": "異質な；大きく異なる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 491,
      "word": "incessant",
      "meaning_ja": "絶え間ない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 492,
      "word": "unruly",
      "meaning_ja": "手に負えない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 493,
      "word": "perfunctory",
      "meaning_ja": "おざなりの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 494,
      "word": "astute",
      "meaning_ja": "洞察力のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 495,
      "word": "invincible",
      "meaning_ja": "無敵の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 496,
      "word": "morbid",
      "meaning_ja": "病的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 497,
      "word": "derogatory",
      "meaning_ja": "軽蔑的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 498,
      "word": "inquisitive",
      "meaning_ja": "好奇心の強い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 499,
      "word": "sheepishly",
      "meaning_ja": "きまり悪そうに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 500,
      "word": "vehemently",
      "meaning_ja": "激しく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 501,
      "word": "evolve",
      "meaning_ja": "進化する；発展する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 502,
      "word": "stem",
      "meaning_ja": "由来する；食い止める；茎",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 503,
      "word": "assert",
      "meaning_ja": "主張する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 504,
      "word": "implement",
      "meaning_ja": "実行する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 505,
      "word": "contradict",
      "meaning_ja": "矛盾する；反論する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 506,
      "word": "convict",
      "meaning_ja": "有罪判決を下す；受刑者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 507,
      "word": "contend",
      "meaning_ja": "主張する；争う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 508,
      "word": "sustain",
      "meaning_ja": "維持する；被る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 509,
      "word": "reproduce",
      "meaning_ja": "再生する；繁殖する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 510,
      "word": "administer",
      "meaning_ja": "管理する；投与する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 511,
      "word": "trigger",
      "meaning_ja": "引き起こす；引き金",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 512,
      "word": "embrace",
      "meaning_ja": "受け入れる；抱き締める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 513,
      "word": "enforce",
      "meaning_ja": "施行する；強制する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 514,
      "word": "incorporate",
      "meaning_ja": "組み込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 515,
      "word": "undergo",
      "meaning_ja": "経験する；受ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 516,
      "word": "facilitate",
      "meaning_ja": "促進する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 517,
      "word": "prevail",
      "meaning_ja": "広く行われる；勝る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 518,
      "word": "enhance",
      "meaning_ja": "高める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 519,
      "word": "condemn",
      "meaning_ja": "非難する；刑を宣告する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 520,
      "word": "comprise",
      "meaning_ja": "含む；構成する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 521,
      "word": "persist",
      "meaning_ja": "固執する；持続する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 522,
      "word": "defy",
      "meaning_ja": "逆らう；拒む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 523,
      "word": "retain",
      "meaning_ja": "保持する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 524,
      "word": "cultivate",
      "meaning_ja": "耕す；養う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 525,
      "word": "domesticate",
      "meaning_ja": "家畜化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 526,
      "word": "perish",
      "meaning_ja": "死ぬ；滅びる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 527,
      "word": "execute",
      "meaning_ja": "実行する；処刑する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 528,
      "word": "reinforce",
      "meaning_ja": "強化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 529,
      "word": "assault",
      "meaning_ja": "襲撃する；暴行",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 530,
      "word": "implant",
      "meaning_ja": "埋め込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 531,
      "word": "torture",
      "meaning_ja": "拷問する；拷問",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 532,
      "word": "phenomenon",
      "meaning_ja": "現象",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 533,
      "word": "perspective",
      "meaning_ja": "視点；見通し",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 534,
      "word": "trait",
      "meaning_ja": "特性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 535,
      "word": "proponent",
      "meaning_ja": "支持者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 536,
      "word": "hypothesis",
      "meaning_ja": "仮説",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 537,
      "word": "ruling",
      "meaning_ja": "判決；支配的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 538,
      "word": "ally",
      "meaning_ja": "同盟国；味方",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 539,
      "word": "tank",
      "meaning_ja": "戦車；貯蔵槽",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 540,
      "word": "paradigm",
      "meaning_ja": "典型；思考の枠組み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 541,
      "word": "tactic",
      "meaning_ja": "戦術",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 542,
      "word": "peasant",
      "meaning_ja": "農民",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 543,
      "word": "homicide",
      "meaning_ja": "殺人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 544,
      "word": "bankruptcy",
      "meaning_ja": "破産",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 545,
      "word": "juror",
      "meaning_ja": "陪審員",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 546,
      "word": "predator",
      "meaning_ja": "捕食者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 547,
      "word": "molecule",
      "meaning_ja": "分子",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 548,
      "word": "rebellion",
      "meaning_ja": "反乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 549,
      "word": "artifact",
      "meaning_ja": "人工遺物；工芸品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 550,
      "word": "regime",
      "meaning_ja": "政権；体制",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 551,
      "word": "accusation",
      "meaning_ja": "告発；非難",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 552,
      "word": "founder",
      "meaning_ja": "創設者；沈没する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 553,
      "word": "capitalism",
      "meaning_ja": "資本主義",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 554,
      "word": "corruption",
      "meaning_ja": "腐敗；汚職",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 555,
      "word": "conviction",
      "meaning_ja": "確信；有罪判決",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 556,
      "word": "criterion",
      "meaning_ja": "基準",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 557,
      "word": "narrative",
      "meaning_ja": "物語；叙述",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 558,
      "word": "herd",
      "meaning_ja": "群れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 559,
      "word": "veteran",
      "meaning_ja": "熟練者；退役軍人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 560,
      "word": "incentive",
      "meaning_ja": "動機；奨励金",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 561,
      "word": "agenda",
      "meaning_ja": "議題；行動計画",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 562,
      "word": "alliance",
      "meaning_ja": "同盟",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 563,
      "word": "merit",
      "meaning_ja": "長所；価値",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 564,
      "word": "sentiment",
      "meaning_ja": "感情；意見",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 565,
      "word": "reversal",
      "meaning_ja": "逆転；撤回",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 566,
      "word": "coup",
      "meaning_ja": "クーデター；大成功",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 567,
      "word": "primate",
      "meaning_ja": "霊長類",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 568,
      "word": "recipient",
      "meaning_ja": "受取人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 569,
      "word": "alteration",
      "meaning_ja": "変更",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 570,
      "word": "flaw",
      "meaning_ja": "欠点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 571,
      "word": "aggression",
      "meaning_ja": "攻撃性；侵略",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 572,
      "word": "correlation",
      "meaning_ja": "相関関係",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 573,
      "word": "sediment",
      "meaning_ja": "堆積物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 574,
      "word": "pathogen",
      "meaning_ja": "病原体",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 575,
      "word": "compensation",
      "meaning_ja": "補償；報酬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 576,
      "word": "monarchy",
      "meaning_ja": "君主制",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 577,
      "word": "variant",
      "meaning_ja": "変種",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 578,
      "word": "transition",
      "meaning_ja": "移行",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 579,
      "word": "expertise",
      "meaning_ja": "専門知識",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 580,
      "word": "relevance",
      "meaning_ja": "関連性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 581,
      "word": "sway",
      "meaning_ja": "揺れる；支配力",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 582,
      "word": "indigenous",
      "meaning_ja": "先住の；固有の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 583,
      "word": "extinct",
      "meaning_ja": "絶滅した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 584,
      "word": "subsequent",
      "meaning_ja": "その後の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 585,
      "word": "colonial",
      "meaning_ja": "植民地の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 586,
      "word": "distinct",
      "meaning_ja": "明確に異なる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 587,
      "word": "cognitive",
      "meaning_ja": "認知の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 588,
      "word": "inevitable",
      "meaning_ja": "避けられない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 589,
      "word": "inherent",
      "meaning_ja": "本来備わった",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 590,
      "word": "legitimate",
      "meaning_ja": "合法的な；正当な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 591,
      "word": "vulnerable",
      "meaning_ja": "傷つきやすい；脆弱な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 592,
      "word": "skeptical",
      "meaning_ja": "懐疑的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 593,
      "word": "neural",
      "meaning_ja": "神経の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 594,
      "word": "prominent",
      "meaning_ja": "著名な；目立つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 595,
      "word": "collective",
      "meaning_ja": "集団の；共同の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 596,
      "word": "hostile",
      "meaning_ja": "敵意のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 597,
      "word": "primitive",
      "meaning_ja": "原始的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 598,
      "word": "equivalent",
      "meaning_ja": "同等の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 599,
      "word": "ultimately",
      "meaning_ja": "最終的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 600,
      "word": "genetically",
      "meaning_ja": "遺伝的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 601,
      "word": "flee",
      "meaning_ja": "逃げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 602,
      "word": "migrate",
      "meaning_ja": "移住する；渡る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 603,
      "word": "bind",
      "meaning_ja": "縛る；結び付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 604,
      "word": "inhibit",
      "meaning_ja": "抑制する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 605,
      "word": "reside",
      "meaning_ja": "居住する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 606,
      "word": "transmit",
      "meaning_ja": "伝達する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 607,
      "word": "dub",
      "meaning_ja": "名付ける；吹き替える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 608,
      "word": "roam",
      "meaning_ja": "歩き回る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 609,
      "word": "undertake",
      "meaning_ja": "引き受ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 610,
      "word": "thrive",
      "meaning_ja": "繁栄する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 611,
      "word": "halt",
      "meaning_ja": "停止する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 612,
      "word": "spur",
      "meaning_ja": "駆り立てる；拍車",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 613,
      "word": "collaborate",
      "meaning_ja": "協力する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 614,
      "word": "exert",
      "meaning_ja": "力などを及ぼす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 615,
      "word": "slaughter",
      "meaning_ja": "虐殺する；屠殺する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 616,
      "word": "allocate",
      "meaning_ja": "割り当てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 617,
      "word": "enact",
      "meaning_ja": "制定する；演じる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 618,
      "word": "encompass",
      "meaning_ja": "包含する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 619,
      "word": "hail",
      "meaning_ja": "称賛する；雹",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 620,
      "word": "unearth",
      "meaning_ja": "発掘する；明るみに出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 621,
      "word": "devastate",
      "meaning_ja": "壊滅させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 622,
      "word": "skyrocket",
      "meaning_ja": "急上昇する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 623,
      "word": "accelerate",
      "meaning_ja": "加速する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 624,
      "word": "uphold",
      "meaning_ja": "支持する；維持する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 625,
      "word": "initiate",
      "meaning_ja": "開始する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 626,
      "word": "ravage",
      "meaning_ja": "荒廃させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 627,
      "word": "suppress",
      "meaning_ja": "抑圧する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 628,
      "word": "displace",
      "meaning_ja": "移動させる；取って代わる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 629,
      "word": "subordinate",
      "meaning_ja": "下位の；部下",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 630,
      "word": "supplement",
      "meaning_ja": "補足する；補足",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 631,
      "word": "revolt",
      "meaning_ja": "反乱；反抗する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 632,
      "word": "asteroid",
      "meaning_ja": "小惑星",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 633,
      "word": "rodent",
      "meaning_ja": "齧歯類",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 634,
      "word": "resurrection",
      "meaning_ja": "復活",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 635,
      "word": "inmate",
      "meaning_ja": "収容者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 636,
      "word": "pest",
      "meaning_ja": "害虫",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 637,
      "word": "awe",
      "meaning_ja": "畏敬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 638,
      "word": "scope",
      "meaning_ja": "範囲；余地",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 639,
      "word": "privilege",
      "meaning_ja": "特権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 640,
      "word": "censorship",
      "meaning_ja": "検閲",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 641,
      "word": "descendant",
      "meaning_ja": "子孫",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 642,
      "word": "drought",
      "meaning_ja": "干ばつ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 643,
      "word": "methane",
      "meaning_ja": "メタン",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 644,
      "word": "misdemeanor",
      "meaning_ja": "軽犯罪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 645,
      "word": "obstetrician",
      "meaning_ja": "産科医",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 646,
      "word": "credibility",
      "meaning_ja": "信頼性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 647,
      "word": "prestige",
      "meaning_ja": "名声",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 648,
      "word": "optimism",
      "meaning_ja": "楽観主義",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 649,
      "word": "hierarchy",
      "meaning_ja": "階層構造",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 650,
      "word": "preservation",
      "meaning_ja": "保存",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 651,
      "word": "rivalry",
      "meaning_ja": "競争関係",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 652,
      "word": "practitioner",
      "meaning_ja": "実務家；開業医",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 653,
      "word": "habitat",
      "meaning_ja": "生息地",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 654,
      "word": "tenure",
      "meaning_ja": "在職期間；終身在職権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 655,
      "word": "brutality",
      "meaning_ja": "残虐性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 656,
      "word": "aftermath",
      "meaning_ja": "余波",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 657,
      "word": "unrest",
      "meaning_ja": "不安；騒乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 658,
      "word": "coalition",
      "meaning_ja": "連立；連合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 659,
      "word": "irrigation",
      "meaning_ja": "灌漑",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 660,
      "word": "commodity",
      "meaning_ja": "商品；日用品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 661,
      "word": "dominance",
      "meaning_ja": "優位；支配",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 662,
      "word": "backlash",
      "meaning_ja": "反発",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 663,
      "word": "surge",
      "meaning_ja": "急増；殺到する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 664,
      "word": "norm",
      "meaning_ja": "標準；規範",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 665,
      "word": "catastrophe",
      "meaning_ja": "大惨事",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 666,
      "word": "resentment",
      "meaning_ja": "憤り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 667,
      "word": "toll",
      "meaning_ja": "犠牲者数；通行料",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 668,
      "word": "asset",
      "meaning_ja": "資産；強み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 669,
      "word": "microbe",
      "meaning_ja": "微生物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 670,
      "word": "severity",
      "meaning_ja": "深刻さ；厳しさ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 671,
      "word": "diagnosis",
      "meaning_ja": "診断",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 672,
      "word": "nobility",
      "meaning_ja": "貴族；高潔さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 673,
      "word": "militia",
      "meaning_ja": "民兵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 674,
      "word": "clergy",
      "meaning_ja": "聖職者たち",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 675,
      "word": "reservoir",
      "meaning_ja": "貯水池",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 676,
      "word": "upheaval",
      "meaning_ja": "激変；大混乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 677,
      "word": "neutrality",
      "meaning_ja": "中立",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 678,
      "word": "array",
      "meaning_ja": "配列；多種多様なもの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 679,
      "word": "duration",
      "meaning_ja": "期間",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 680,
      "word": "collision",
      "meaning_ja": "衝突",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 681,
      "word": "lapse",
      "meaning_ja": "過失；失効する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 682,
      "word": "raid",
      "meaning_ja": "急襲；手入れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 683,
      "word": "captive",
      "meaning_ja": "捕虜；捕らわれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 684,
      "word": "compelling",
      "meaning_ja": "説得力のある；心を引く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 685,
      "word": "strategic",
      "meaning_ja": "戦略上の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 686,
      "word": "extraterrestrial",
      "meaning_ja": "地球外の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 687,
      "word": "comprehensive",
      "meaning_ja": "包括的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 688,
      "word": "unprecedented",
      "meaning_ja": "前例のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 689,
      "word": "sole",
      "meaning_ja": "唯一の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 690,
      "word": "ethical",
      "meaning_ja": "倫理的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 691,
      "word": "negligible",
      "meaning_ja": "無視できるほど小さい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 692,
      "word": "agrarian",
      "meaning_ja": "農業の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 693,
      "word": "notable",
      "meaning_ja": "注目すべき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 694,
      "word": "indispensable",
      "meaning_ja": "不可欠な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 695,
      "word": "irrelevant",
      "meaning_ja": "無関係な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 696,
      "word": "outright",
      "meaning_ja": "完全な；あからさまな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 697,
      "word": "drastic",
      "meaning_ja": "抜本的な；急激な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 698,
      "word": "fragile",
      "meaning_ja": "壊れやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 699,
      "word": "judicial",
      "meaning_ja": "司法の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 700,
      "word": "albeit",
      "meaning_ja": "とはいえ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 701,
      "word": "enlighten",
      "meaning_ja": "啓発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 702,
      "word": "detest",
      "meaning_ja": "ひどく嫌う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 703,
      "word": "revitalize",
      "meaning_ja": "活性化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 704,
      "word": "coerce",
      "meaning_ja": "強要する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 705,
      "word": "elicit",
      "meaning_ja": "引き出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 706,
      "word": "rumble",
      "meaning_ja": "ごろごろ鳴る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 707,
      "word": "mar",
      "meaning_ja": "損なう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 708,
      "word": "litigate",
      "meaning_ja": "訴訟を起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 709,
      "word": "reinstate",
      "meaning_ja": "復職させる；復活させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 710,
      "word": "congregate",
      "meaning_ja": "集合する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 711,
      "word": "evade",
      "meaning_ja": "逃れる；はぐらかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 712,
      "word": "replicate",
      "meaning_ja": "複製する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 713,
      "word": "contravene",
      "meaning_ja": "違反する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 714,
      "word": "extort",
      "meaning_ja": "ゆすり取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 715,
      "word": "forgo",
      "meaning_ja": "なしで済ませる；断念する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 716,
      "word": "stammer",
      "meaning_ja": "どもる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 717,
      "word": "dupe",
      "meaning_ja": "だます；だまされやすい人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 718,
      "word": "pounce",
      "meaning_ja": "飛びかかる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 719,
      "word": "deride",
      "meaning_ja": "嘲笑する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 720,
      "word": "swindle",
      "meaning_ja": "だまし取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 721,
      "word": "condone",
      "meaning_ja": "大目に見る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 722,
      "word": "decry",
      "meaning_ja": "公然と非難する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 723,
      "word": "indulge",
      "meaning_ja": "欲望を満たす；甘やかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 724,
      "word": "abdicate",
      "meaning_ja": "退位する；放棄する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 725,
      "word": "bluff",
      "meaning_ja": "はったり；はったりをかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 726,
      "word": "nullify",
      "meaning_ja": "無効にする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 727,
      "word": "propagate",
      "meaning_ja": "広める；繁殖させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 728,
      "word": "proliferate",
      "meaning_ja": "急増する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 729,
      "word": "repatriate",
      "meaning_ja": "本国へ送還する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 730,
      "word": "canvass",
      "meaning_ja": "支持を求めて回る；調査する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 731,
      "word": "falter",
      "meaning_ja": "ためらう；勢いが衰える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 732,
      "word": "flaunt",
      "meaning_ja": "見せびらかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 733,
      "word": "cringe",
      "meaning_ja": "すくむ；へつらう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 734,
      "word": "appraise",
      "meaning_ja": "評価する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 735,
      "word": "adjourn",
      "meaning_ja": "休会する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 736,
      "word": "clench",
      "meaning_ja": "握り締める；食いしばる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 737,
      "word": "defraud",
      "meaning_ja": "だまし取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 738,
      "word": "regurgitate",
      "meaning_ja": "吐き戻す；丸暗記したことを繰り返す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 739,
      "word": "ensconce",
      "meaning_ja": "落ち着かせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 740,
      "word": "calibrate",
      "meaning_ja": "目盛りを調整する；校正する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 741,
      "word": "botch",
      "meaning_ja": "しくじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 742,
      "word": "reprieve",
      "meaning_ja": "刑の執行猶予；一時的な救済",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 743,
      "word": "mock",
      "meaning_ja": "あざける；模擬の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 744,
      "word": "hoax",
      "meaning_ja": "でっち上げ；いたずら",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 745,
      "word": "juncture",
      "meaning_ja": "時点；重大な局面",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 746,
      "word": "agility",
      "meaning_ja": "敏捷さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 747,
      "word": "dearth",
      "meaning_ja": "不足",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 748,
      "word": "libel",
      "meaning_ja": "文書による名誉毀損",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 749,
      "word": "crux",
      "meaning_ja": "核心",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 750,
      "word": "audacity",
      "meaning_ja": "大胆さ；厚かましさ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 751,
      "word": "diversion",
      "meaning_ja": "気晴らし；迂回",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 752,
      "word": "leeway",
      "meaning_ja": "裁量の余地",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 753,
      "word": "conscription",
      "meaning_ja": "徴兵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 754,
      "word": "protocol",
      "meaning_ja": "議定書；手順",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 755,
      "word": "memento",
      "meaning_ja": "記念品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 756,
      "word": "banter",
      "meaning_ja": "気さくな冗談",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 757,
      "word": "onus",
      "meaning_ja": "責任；負担",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 758,
      "word": "levity",
      "meaning_ja": "軽率さ；不真面目さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 759,
      "word": "rehash",
      "meaning_ja": "焼き直し；焼き直す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 760,
      "word": "constellation",
      "meaning_ja": "星座",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 761,
      "word": "extrovert",
      "meaning_ja": "外向的な人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 762,
      "word": "allegiance",
      "meaning_ja": "忠誠",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 763,
      "word": "placebo",
      "meaning_ja": "偽薬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 764,
      "word": "envoy",
      "meaning_ja": "使節",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 765,
      "word": "slur",
      "meaning_ja": "中傷；不明瞭に発音する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 766,
      "word": "collateral",
      "meaning_ja": "担保；付随的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 767,
      "word": "zeal",
      "meaning_ja": "熱意",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 768,
      "word": "defiance",
      "meaning_ja": "反抗",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 769,
      "word": "mutiny",
      "meaning_ja": "反乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 770,
      "word": "spate",
      "meaning_ja": "多発；続発",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 771,
      "word": "bravado",
      "meaning_ja": "虚勢",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 772,
      "word": "ebb",
      "meaning_ja": "引き潮；衰退",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 773,
      "word": "proviso",
      "meaning_ja": "但し書き",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 774,
      "word": "antiseptic",
      "meaning_ja": "消毒薬；防腐の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 775,
      "word": "copious",
      "meaning_ja": "豊富な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 776,
      "word": "eminent",
      "meaning_ja": "著名な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 777,
      "word": "pervasive",
      "meaning_ja": "広く行き渡った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 778,
      "word": "meager",
      "meaning_ja": "乏しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 779,
      "word": "impeccable",
      "meaning_ja": "非の打ち所のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 780,
      "word": "susceptible",
      "meaning_ja": "影響を受けやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 781,
      "word": "lanky",
      "meaning_ja": "ひょろ長い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 782,
      "word": "stringent",
      "meaning_ja": "厳格な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 783,
      "word": "viable",
      "meaning_ja": "実行可能な；存続可能な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 784,
      "word": "fraught",
      "meaning_ja": "困難などを伴う；緊迫した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 785,
      "word": "probationary",
      "meaning_ja": "試用の；保護観察の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 786,
      "word": "translucent",
      "meaning_ja": "半透明の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 787,
      "word": "dogmatic",
      "meaning_ja": "独断的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 788,
      "word": "nomadic",
      "meaning_ja": "遊牧の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 789,
      "word": "oblique",
      "meaning_ja": "斜めの；遠回しの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 790,
      "word": "tactful",
      "meaning_ja": "機転の利く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 791,
      "word": "aboveboard",
      "meaning_ja": "公明正大な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 792,
      "word": "queasy",
      "meaning_ja": "吐き気のする；不安な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 793,
      "word": "boisterous",
      "meaning_ja": "騒々しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 794,
      "word": "impromptu",
      "meaning_ja": "即興の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 795,
      "word": "profuse",
      "meaning_ja": "豊富な；多量の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 796,
      "word": "venomous",
      "meaning_ja": "有毒な；悪意に満ちた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 797,
      "word": "quizzical",
      "meaning_ja": "いぶかしげな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 798,
      "word": "momentous",
      "meaning_ja": "重大な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 799,
      "word": "adjunct",
      "meaning_ja": "付属物；補助の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 800,
      "word": "posthumously",
      "meaning_ja": "死後に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 801,
      "word": "conciliate",
      "meaning_ja": "なだめる；和解させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 802,
      "word": "squirm",
      "meaning_ja": "身をよじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 803,
      "word": "elucidate",
      "meaning_ja": "明らかにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 804,
      "word": "chastise",
      "meaning_ja": "厳しく叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 805,
      "word": "slouch",
      "meaning_ja": "前かがみになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 806,
      "word": "goad",
      "meaning_ja": "けしかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 807,
      "word": "scamper",
      "meaning_ja": "駆け回る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 808,
      "word": "wade",
      "meaning_ja": "水の中を歩く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 809,
      "word": "teem",
      "meaning_ja": "満ちている；群がる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 810,
      "word": "wilt",
      "meaning_ja": "しおれる；気力を失う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 811,
      "word": "wager",
      "meaning_ja": "賭ける；賭け",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 812,
      "word": "delve",
      "meaning_ja": "詳しく調べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 813,
      "word": "smuggle",
      "meaning_ja": "密輸する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 814,
      "word": "dazzle",
      "meaning_ja": "まぶしくする；感嘆させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 815,
      "word": "diminish",
      "meaning_ja": "減少する；弱める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 816,
      "word": "ponder",
      "meaning_ja": "熟考する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 817,
      "word": "orchestrate",
      "meaning_ja": "巧みに組織する；編曲する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 818,
      "word": "encroach",
      "meaning_ja": "侵入する；侵害する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 819,
      "word": "negate",
      "meaning_ja": "否定する；無効にする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 820,
      "word": "expedite",
      "meaning_ja": "迅速に進める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 821,
      "word": "enunciate",
      "meaning_ja": "明瞭に発音する；明言する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 822,
      "word": "dissect",
      "meaning_ja": "解剖する；詳細に分析する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 823,
      "word": "insulate",
      "meaning_ja": "絶縁する；隔離する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 824,
      "word": "avert",
      "meaning_ja": "回避する；そらす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 825,
      "word": "deter",
      "meaning_ja": "思いとどまらせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 826,
      "word": "juggle",
      "meaning_ja": "複数のことをやりくりする；曲芸で操る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 827,
      "word": "slam",
      "meaning_ja": "激しく閉める；酷評する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 828,
      "word": "mutter",
      "meaning_ja": "つぶやく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 829,
      "word": "stunt",
      "meaning_ja": "発育を妨げる；離れ業",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 830,
      "word": "redress",
      "meaning_ja": "是正する；救済",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 831,
      "word": "deposition",
      "meaning_ja": "宣誓証言；堆積；免職",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 832,
      "word": "vanity",
      "meaning_ja": "虚栄心；むなしさ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 833,
      "word": "altercation",
      "meaning_ja": "口論",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 834,
      "word": "stupor",
      "meaning_ja": "昏迷；意識がもうろうとした状態",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 835,
      "word": "bane",
      "meaning_ja": "悩みの種",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 836,
      "word": "snag",
      "meaning_ja": "障害；引っかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 837,
      "word": "pariah",
      "meaning_ja": "のけ者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 838,
      "word": "omen",
      "meaning_ja": "前兆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 839,
      "word": "forgery",
      "meaning_ja": "偽造；偽造品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 840,
      "word": "precedent",
      "meaning_ja": "先例",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 841,
      "word": "longevity",
      "meaning_ja": "長寿",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 842,
      "word": "momentum",
      "meaning_ja": "勢い；運動量",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 843,
      "word": "plight",
      "meaning_ja": "窮状",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 844,
      "word": "vandalism",
      "meaning_ja": "公共物を故意に壊す行為",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 845,
      "word": "demolition",
      "meaning_ja": "取り壊し",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 846,
      "word": "maneuver",
      "meaning_ja": "巧みな操作；策略",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 847,
      "word": "precipitation",
      "meaning_ja": "降水；沈殿",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 848,
      "word": "obscurity",
      "meaning_ja": "無名；不明瞭さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 849,
      "word": "jest",
      "meaning_ja": "冗談",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 850,
      "word": "hype",
      "meaning_ja": "誇大宣伝",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 851,
      "word": "deportation",
      "meaning_ja": "国外追放",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 852,
      "word": "faction",
      "meaning_ja": "派閥",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 853,
      "word": "onset",
      "meaning_ja": "始まり；発症",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 854,
      "word": "proximity",
      "meaning_ja": "近接",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 855,
      "word": "blister",
      "meaning_ja": "水ぶくれ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 856,
      "word": "ordinance",
      "meaning_ja": "条例；命令",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 857,
      "word": "disparity",
      "meaning_ja": "格差",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 858,
      "word": "provision",
      "meaning_ja": "供給；条項；備え",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 859,
      "word": "curfew",
      "meaning_ja": "外出禁止令；門限",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 860,
      "word": "verdict",
      "meaning_ja": "評決",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 861,
      "word": "counterfeit",
      "meaning_ja": "偽造の；偽造する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 862,
      "word": "strand",
      "meaning_ja": "立ち往生させる；糸；一要素",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 863,
      "word": "prudent",
      "meaning_ja": "慎重な；賢明な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 864,
      "word": "concerted",
      "meaning_ja": "一致協力した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 865,
      "word": "uncanny",
      "meaning_ja": "不気味な；不思議な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 866,
      "word": "awry",
      "meaning_ja": "ゆがんで；計画が狂って",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 867,
      "word": "plenary",
      "meaning_ja": "全員出席の；完全な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 868,
      "word": "complacent",
      "meaning_ja": "自己満足した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 869,
      "word": "desolate",
      "meaning_ja": "荒涼とした；孤独な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 870,
      "word": "livid",
      "meaning_ja": "激怒した；青黒い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 871,
      "word": "tacit",
      "meaning_ja": "暗黙の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 872,
      "word": "fraudulent",
      "meaning_ja": "詐欺的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 873,
      "word": "wayward",
      "meaning_ja": "わがままな；気まぐれな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 874,
      "word": "convoluted",
      "meaning_ja": "複雑で分かりにくい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 875,
      "word": "harrowing",
      "meaning_ja": "痛ましい；つらい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 876,
      "word": "explicit",
      "meaning_ja": "明白な；露骨な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 877,
      "word": "lethal",
      "meaning_ja": "致命的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 878,
      "word": "feasible",
      "meaning_ja": "実行可能な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 879,
      "word": "adjacent",
      "meaning_ja": "隣接した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 880,
      "word": "relentless",
      "meaning_ja": "容赦のない；絶え間ない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 881,
      "word": "devoid",
      "meaning_ja": "欠いている",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 882,
      "word": "cohesive",
      "meaning_ja": "結束した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 883,
      "word": "forensic",
      "meaning_ja": "法医学の；犯罪科学の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 884,
      "word": "arcane",
      "meaning_ja": "難解な；秘伝の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 885,
      "word": "tentative",
      "meaning_ja": "暫定的な；ためらいがちな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 886,
      "word": "assiduous",
      "meaning_ja": "勤勉な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 887,
      "word": "cumulative",
      "meaning_ja": "累積する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 888,
      "word": "conspicuous",
      "meaning_ja": "目立つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 889,
      "word": "resilient",
      "meaning_ja": "回復力のある；弾力のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 890,
      "word": "alleged",
      "meaning_ja": "申し立てられた；疑いのある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 891,
      "word": "optimum",
      "meaning_ja": "最適の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 892,
      "word": "frantic",
      "meaning_ja": "必死の；取り乱した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 893,
      "word": "turbulent",
      "meaning_ja": "激動の；荒れた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 894,
      "word": "arid",
      "meaning_ja": "乾燥した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 895,
      "word": "laudable",
      "meaning_ja": "称賛に値する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 896,
      "word": "ubiquitous",
      "meaning_ja": "至る所にある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 897,
      "word": "covert",
      "meaning_ja": "秘密の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 898,
      "word": "subdued",
      "meaning_ja": "抑えた；落ち着いた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 899,
      "word": "dissident",
      "meaning_ja": "反体制派の；反対者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 900,
      "word": "brusquely",
      "meaning_ja": "ぶっきらぼうに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 901,
      "word": "decipher",
      "meaning_ja": "解読する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 902,
      "word": "sprout",
      "meaning_ja": "芽を出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 903,
      "word": "temper",
      "meaning_ja": "和らげる；気性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 904,
      "word": "assail",
      "meaning_ja": "襲う；激しく非難する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 905,
      "word": "preclude",
      "meaning_ja": "不可能にする；排除する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 906,
      "word": "relish",
      "meaning_ja": "楽しむ；風味",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 907,
      "word": "waive",
      "meaning_ja": "権利などを放棄する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 908,
      "word": "spearhead",
      "meaning_ja": "先頭に立つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 909,
      "word": "infringe",
      "meaning_ja": "侵害する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 910,
      "word": "abort",
      "meaning_ja": "中止する；中絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 911,
      "word": "balk",
      "meaning_ja": "ためらう；拒む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 912,
      "word": "underscore",
      "meaning_ja": "強調する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 913,
      "word": "haggle",
      "meaning_ja": "値切る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 914,
      "word": "repeal",
      "meaning_ja": "廃止する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 915,
      "word": "scuttle",
      "meaning_ja": "小走りする；計画を潰す；船を沈める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 916,
      "word": "confound",
      "meaning_ja": "困惑させる；覆す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 917,
      "word": "unravel",
      "meaning_ja": "解きほぐす；解明する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 918,
      "word": "aggravate",
      "meaning_ja": "悪化させる；いら立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 919,
      "word": "detonate",
      "meaning_ja": "爆発させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 920,
      "word": "hurtle",
      "meaning_ja": "猛スピードで進む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 921,
      "word": "stump",
      "meaning_ja": "困らせる；切り株",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 922,
      "word": "delegate",
      "meaning_ja": "委任する；代表者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 923,
      "word": "repulse",
      "meaning_ja": "撃退する；嫌悪させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 924,
      "word": "affix",
      "meaning_ja": "貼り付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 925,
      "word": "afflict",
      "meaning_ja": "苦しめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 926,
      "word": "perspire",
      "meaning_ja": "汗をかく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 927,
      "word": "protrude",
      "meaning_ja": "突き出る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 928,
      "word": "verify",
      "meaning_ja": "確かめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 929,
      "word": "chant",
      "meaning_ja": "繰り返し唱える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 930,
      "word": "careen",
      "meaning_ja": "傾きながら疾走する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 931,
      "word": "sever",
      "meaning_ja": "切断する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 932,
      "word": "abet",
      "meaning_ja": "犯罪をそそのかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 933,
      "word": "gauge",
      "meaning_ja": "測定する；計器",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 934,
      "word": "embed",
      "meaning_ja": "埋め込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 935,
      "word": "restraint",
      "meaning_ja": "抑制；拘束",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 936,
      "word": "qualm",
      "meaning_ja": "不安；良心のとがめ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 937,
      "word": "complicity",
      "meaning_ja": "共謀",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 938,
      "word": "insurgency",
      "meaning_ja": "反乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 939,
      "word": "premise",
      "meaning_ja": "前提",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 940,
      "word": "anomaly",
      "meaning_ja": "異常；例外",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 941,
      "word": "upshot",
      "meaning_ja": "結末",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 942,
      "word": "strain",
      "meaning_ja": "負担；緊張；系統",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 943,
      "word": "pitfall",
      "meaning_ja": "落とし穴",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 944,
      "word": "aptitude",
      "meaning_ja": "適性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 945,
      "word": "indiscretion",
      "meaning_ja": "軽率な言動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 946,
      "word": "liability",
      "meaning_ja": "責任；負債；不利なもの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 947,
      "word": "grudge",
      "meaning_ja": "恨み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 948,
      "word": "jeopardy",
      "meaning_ja": "危険",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 949,
      "word": "amnesty",
      "meaning_ja": "恩赦",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 950,
      "word": "consignment",
      "meaning_ja": "委託貨物；発送",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 951,
      "word": "haven",
      "meaning_ja": "避難場所",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 952,
      "word": "novice",
      "meaning_ja": "初心者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 953,
      "word": "benevolence",
      "meaning_ja": "慈悲；善意",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 954,
      "word": "deliberation",
      "meaning_ja": "熟考；審議",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 955,
      "word": "avalanche",
      "meaning_ja": "雪崩；殺到",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 956,
      "word": "eviction",
      "meaning_ja": "立ち退き",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 957,
      "word": "adversary",
      "meaning_ja": "敵対者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 958,
      "word": "testament",
      "meaning_ja": "証拠；遺言",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 959,
      "word": "commune",
      "meaning_ja": "共同体；心を通わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 960,
      "word": "fixture",
      "meaning_ja": "固定設備；常連",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 961,
      "word": "installment",
      "meaning_ja": "分割払いの1回分；連載の1回分",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 962,
      "word": "depreciation",
      "meaning_ja": "価値の下落；減価償却",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 963,
      "word": "antithesis",
      "meaning_ja": "正反対",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 964,
      "word": "analogous",
      "meaning_ja": "類似した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 965,
      "word": "ruthless",
      "meaning_ja": "冷酷な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 966,
      "word": "eerie",
      "meaning_ja": "不気味な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 967,
      "word": "liable",
      "meaning_ja": "責任を負う；しがちな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 968,
      "word": "arduous",
      "meaning_ja": "骨の折れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 969,
      "word": "affable",
      "meaning_ja": "親しみやすい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 970,
      "word": "stark",
      "meaning_ja": "厳しい；むき出しの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 971,
      "word": "slack",
      "meaning_ja": "緩んだ；不活発な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 972,
      "word": "pivotal",
      "meaning_ja": "極めて重要な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 973,
      "word": "ablaze",
      "meaning_ja": "燃え立って",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 974,
      "word": "sumptuous",
      "meaning_ja": "豪華な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 975,
      "word": "entrenched",
      "meaning_ja": "根強い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 976,
      "word": "recurrent",
      "meaning_ja": "繰り返し起こる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 977,
      "word": "distraught",
      "meaning_ja": "取り乱した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 978,
      "word": "thrifty",
      "meaning_ja": "倹約的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 979,
      "word": "rowdy",
      "meaning_ja": "騒々しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 980,
      "word": "insatiable",
      "meaning_ja": "飽くことのない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 981,
      "word": "commensurate",
      "meaning_ja": "釣り合った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 982,
      "word": "rife",
      "meaning_ja": "蔓延した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 983,
      "word": "secluded",
      "meaning_ja": "人里離れた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 984,
      "word": "extenuating",
      "meaning_ja": "罪を軽くする；酌量すべき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 985,
      "word": "amiable",
      "meaning_ja": "愛想のよい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 986,
      "word": "dire",
      "meaning_ja": "悲惨な；切迫した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 987,
      "word": "congenial",
      "meaning_ja": "気性の合う；快適な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 988,
      "word": "frazzled",
      "meaning_ja": "疲れ果てた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 989,
      "word": "squalid",
      "meaning_ja": "不潔でみすぼらしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 990,
      "word": "impassive",
      "meaning_ja": "無表情な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 991,
      "word": "clichéd",
      "meaning_ja": "陳腐な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 992,
      "word": "infallible",
      "meaning_ja": "絶対に間違わない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 993,
      "word": "contingent",
      "meaning_ja": "条件次第の；派遣団",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 994,
      "word": "unanimously",
      "meaning_ja": "満場一致で",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 995,
      "word": "intermittently",
      "meaning_ja": "断続的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 996,
      "word": "surreptitiously",
      "meaning_ja": "こっそりと",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 997,
      "word": "meekly",
      "meaning_ja": "おとなしく；従順に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 998,
      "word": "retroactively",
      "meaning_ja": "さかのぼって",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 999,
      "word": "autonomously",
      "meaning_ja": "自律的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1000,
      "word": "degenerate",
      "meaning_ja": "退化する；堕落した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1001,
      "word": "allot",
      "meaning_ja": "割り当てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1002,
      "word": "blare",
      "meaning_ja": "鳴り響く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1003,
      "word": "flex",
      "meaning_ja": "筋肉を曲げる；力を誇示する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1004,
      "word": "avenge",
      "meaning_ja": "復讐する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1005,
      "word": "convene",
      "meaning_ja": "招集する；集まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1006,
      "word": "catapult",
      "meaning_ja": "勢いよく飛ばす；投石器",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1007,
      "word": "proscribe",
      "meaning_ja": "禁止する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1008,
      "word": "align",
      "meaning_ja": "並べる；足並みをそろえる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1009,
      "word": "clinch",
      "meaning_ja": "確定する；決着をつける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1010,
      "word": "pry",
      "meaning_ja": "詮索する；こじ開ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1011,
      "word": "relent",
      "meaning_ja": "態度を和らげる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1012,
      "word": "infuse",
      "meaning_ja": "注ぎ込む；吹き込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1013,
      "word": "secrete",
      "meaning_ja": "分泌する；隠す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1014,
      "word": "debrief",
      "meaning_ja": "任務後に報告を聞く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1015,
      "word": "perplex",
      "meaning_ja": "当惑させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1016,
      "word": "inhale",
      "meaning_ja": "吸い込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1017,
      "word": "ratify",
      "meaning_ja": "批准する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1018,
      "word": "converge",
      "meaning_ja": "一点に集まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1019,
      "word": "rant",
      "meaning_ja": "わめき立てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1020,
      "word": "intercede",
      "meaning_ja": "仲裁する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1021,
      "word": "varnish",
      "meaning_ja": "ニスを塗る；うわべを飾る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1022,
      "word": "wrest",
      "meaning_ja": "もぎ取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1023,
      "word": "woo",
      "meaning_ja": "求愛する；支持を取り付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1024,
      "word": "typify",
      "meaning_ja": "典型となる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1025,
      "word": "brew",
      "meaning_ja": "醸造する；起こりかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1026,
      "word": "instigate",
      "meaning_ja": "扇動する；引き起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1027,
      "word": "rectify",
      "meaning_ja": "是正する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1028,
      "word": "resuscitate",
      "meaning_ja": "蘇生させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1029,
      "word": "lament",
      "meaning_ja": "嘆く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1030,
      "word": "appease",
      "meaning_ja": "なだめる；譲歩して鎮める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1031,
      "word": "disparage",
      "meaning_ja": "けなす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1032,
      "word": "brandish",
      "meaning_ja": "振りかざす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1033,
      "word": "obliterate",
      "meaning_ja": "完全に消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1034,
      "word": "oust",
      "meaning_ja": "追放する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1035,
      "word": "reverberate",
      "meaning_ja": "反響する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1036,
      "word": "excavate",
      "meaning_ja": "発掘する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1037,
      "word": "resonate",
      "meaning_ja": "共鳴する；心に響く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1038,
      "word": "sojourn",
      "meaning_ja": "一時滞在；一時滞在する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1039,
      "word": "jostle",
      "meaning_ja": "押しのける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1040,
      "word": "enumerate",
      "meaning_ja": "列挙する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1041,
      "word": "pulverize",
      "meaning_ja": "粉砕する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1042,
      "word": "parry",
      "meaning_ja": "受け流す；かわす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1043,
      "word": "incense",
      "meaning_ja": "激怒させる；香",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1044,
      "word": "gust",
      "meaning_ja": "突風",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1045,
      "word": "skirmish",
      "meaning_ja": "小競り合い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1046,
      "word": "arson",
      "meaning_ja": "放火",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1047,
      "word": "expletive",
      "meaning_ja": "ののしり言葉",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1048,
      "word": "cordon",
      "meaning_ja": "非常線",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1049,
      "word": "austerity",
      "meaning_ja": "緊縮財政；質素",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1050,
      "word": "confederation",
      "meaning_ja": "連合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1051,
      "word": "terrain",
      "meaning_ja": "地形",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1052,
      "word": "query",
      "meaning_ja": "質問",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1053,
      "word": "moratorium",
      "meaning_ja": "一時停止；支払猶予",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1054,
      "word": "retrospect",
      "meaning_ja": "回顧",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1055,
      "word": "malaise",
      "meaning_ja": "不調；倦怠感",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1056,
      "word": "pseudonym",
      "meaning_ja": "筆名；偽名",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1057,
      "word": "scam",
      "meaning_ja": "詐欺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1058,
      "word": "contrition",
      "meaning_ja": "深い悔恨",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1059,
      "word": "stipulation",
      "meaning_ja": "条件；取り決め",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1060,
      "word": "tatter",
      "meaning_ja": "ぼろ切れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1061,
      "word": "quarantine",
      "meaning_ja": "検疫；隔離する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1062,
      "word": "infirmary",
      "meaning_ja": "医務室；診療所",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1063,
      "word": "zest",
      "meaning_ja": "熱意；風味",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1064,
      "word": "pageant",
      "meaning_ja": "華やかな催し；美人コンテスト",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1065,
      "word": "morsel",
      "meaning_ja": "一口分；少量",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1066,
      "word": "relapse",
      "meaning_ja": "再発；再び悪化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1067,
      "word": "transgression",
      "meaning_ja": "違反；罪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1068,
      "word": "tenet",
      "meaning_ja": "信条",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1069,
      "word": "mirage",
      "meaning_ja": "蜃気楼；幻想",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1070,
      "word": "painstaking",
      "meaning_ja": "入念な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1071,
      "word": "atrocious",
      "meaning_ja": "残虐な；ひどい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1072,
      "word": "curt",
      "meaning_ja": "そっけない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1073,
      "word": "nocturnal",
      "meaning_ja": "夜行性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1074,
      "word": "arable",
      "meaning_ja": "耕作可能な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1075,
      "word": "daunting",
      "meaning_ja": "気後れさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1076,
      "word": "intravenous",
      "meaning_ja": "静脈内の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1077,
      "word": "acrimonious",
      "meaning_ja": "辛辣な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1078,
      "word": "illegible",
      "meaning_ja": "判読できない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1079,
      "word": "bogus",
      "meaning_ja": "偽の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1080,
      "word": "fishy",
      "meaning_ja": "怪しい；魚臭い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1081,
      "word": "humdrum",
      "meaning_ja": "単調な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1082,
      "word": "conversant",
      "meaning_ja": "精通した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1083,
      "word": "tart",
      "meaning_ja": "酸っぱい；辛辣な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1084,
      "word": "premeditated",
      "meaning_ja": "計画的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1085,
      "word": "spurious",
      "meaning_ja": "偽の；根拠のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1086,
      "word": "intrinsic",
      "meaning_ja": "本質的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1087,
      "word": "innocuous",
      "meaning_ja": "無害な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1088,
      "word": "sluggish",
      "meaning_ja": "鈍い；停滞した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1089,
      "word": "insipid",
      "meaning_ja": "味気ない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1090,
      "word": "ecstatic",
      "meaning_ja": "有頂天の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1091,
      "word": "superfluous",
      "meaning_ja": "余分な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1092,
      "word": "propitious",
      "meaning_ja": "好都合な；幸先のよい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1093,
      "word": "devious",
      "meaning_ja": "ずるい；遠回りの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1094,
      "word": "omniscient",
      "meaning_ja": "全知の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1095,
      "word": "petulant",
      "meaning_ja": "不機嫌な；すねた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1096,
      "word": "idly",
      "meaning_ja": "何もせずに；ぼんやりと",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1097,
      "word": "innately",
      "meaning_ja": "生まれつき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1098,
      "word": "aesthetically",
      "meaning_ja": "美的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1099,
      "word": "arguably",
      "meaning_ja": "おそらく；議論の余地はあるが",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1100,
      "word": "fumble",
      "meaning_ja": "手探りする；不器用に扱う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1101,
      "word": "pester",
      "meaning_ja": "しつこく悩ませる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1102,
      "word": "taunt",
      "meaning_ja": "あざける；挑発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1103,
      "word": "fortify",
      "meaning_ja": "強化する；要塞化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1104,
      "word": "venerate",
      "meaning_ja": "崇敬する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1105,
      "word": "preside",
      "meaning_ja": "議長を務める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1106,
      "word": "regale",
      "meaning_ja": "話や食事で楽しませる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1107,
      "word": "squabble",
      "meaning_ja": "口げんかする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1108,
      "word": "vanquish",
      "meaning_ja": "打ち負かす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1109,
      "word": "trample",
      "meaning_ja": "踏みつける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1110,
      "word": "denounce",
      "meaning_ja": "公然と非難する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1111,
      "word": "scour",
      "meaning_ja": "くまなく探す；磨く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1112,
      "word": "surmise",
      "meaning_ja": "推測する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1113,
      "word": "improvise",
      "meaning_ja": "即興で行う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1114,
      "word": "suffocate",
      "meaning_ja": "窒息させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1115,
      "word": "smear",
      "meaning_ja": "塗りつける；中傷する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1116,
      "word": "concoct",
      "meaning_ja": "調合する；でっち上げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1117,
      "word": "rescind",
      "meaning_ja": "撤回する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1118,
      "word": "relinquish",
      "meaning_ja": "手放す；放棄する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1119,
      "word": "revoke",
      "meaning_ja": "取り消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1120,
      "word": "inaugurate",
      "meaning_ja": "就任させる；開始する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1121,
      "word": "foment",
      "meaning_ja": "騒乱などを煽る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1122,
      "word": "dismantle",
      "meaning_ja": "解体する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1123,
      "word": "rejuvenate",
      "meaning_ja": "若返らせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1124,
      "word": "saturate",
      "meaning_ja": "浸す；飽和させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1125,
      "word": "subjugate",
      "meaning_ja": "征服する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1126,
      "word": "debase",
      "meaning_ja": "価値を下げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1127,
      "word": "postulate",
      "meaning_ja": "仮定する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1128,
      "word": "transcend",
      "meaning_ja": "超越する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1129,
      "word": "ascribe",
      "meaning_ja": "原因を帰する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1130,
      "word": "chuckle",
      "meaning_ja": "くすくす笑う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1131,
      "word": "nibble",
      "meaning_ja": "少しずつかじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1132,
      "word": "veto",
      "meaning_ja": "拒否権；拒否する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1133,
      "word": "infiltrate",
      "meaning_ja": "潜入する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1134,
      "word": "perturb",
      "meaning_ja": "動揺させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1135,
      "word": "prevaricate",
      "meaning_ja": "言い逃れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1136,
      "word": "ingratiate",
      "meaning_ja": "取り入る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1137,
      "word": "glean",
      "meaning_ja": "情報などを少しずつ集める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1138,
      "word": "coalesce",
      "meaning_ja": "合体する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1139,
      "word": "mangle",
      "meaning_ja": "ひどく損傷させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1140,
      "word": "sequester",
      "meaning_ja": "隔離する；差し押さえる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1141,
      "word": "segregate",
      "meaning_ja": "分離する；隔離する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1142,
      "word": "snub",
      "meaning_ja": "冷たくあしらう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1143,
      "word": "garnish",
      "meaning_ja": "料理に付け合わせを添える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1144,
      "word": "hedge",
      "meaning_ja": "垣根；損失に備える；明言を避ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1145,
      "word": "wrench",
      "meaning_ja": "ねじる；もぎ取る；レンチ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1146,
      "word": "transpose",
      "meaning_ja": "位置を入れ替える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1147,
      "word": "invert",
      "meaning_ja": "逆にする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1148,
      "word": "hunch",
      "meaning_ja": "予感；背を丸める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1149,
      "word": "felony",
      "meaning_ja": "重罪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1150,
      "word": "cramp",
      "meaning_ja": "けいれん；束縛する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1151,
      "word": "calamity",
      "meaning_ja": "大災害",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1152,
      "word": "pundit",
      "meaning_ja": "専門家；評論家",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1153,
      "word": "decoy",
      "meaning_ja": "おとり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1154,
      "word": "travesty",
      "meaning_ja": "茶番；歪曲した模倣",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1155,
      "word": "rendition",
      "meaning_ja": "演奏；表現；引き渡し",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1156,
      "word": "combustion",
      "meaning_ja": "燃焼",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1157,
      "word": "shackle",
      "meaning_ja": "足かせ；束縛する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1158,
      "word": "decorum",
      "meaning_ja": "礼儀作法",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1159,
      "word": "matrimony",
      "meaning_ja": "結婚",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1160,
      "word": "quirk",
      "meaning_ja": "奇癖",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1161,
      "word": "premonition",
      "meaning_ja": "予感；虫の知らせ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1162,
      "word": "allure",
      "meaning_ja": "魅力；魅惑する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1163,
      "word": "stigma",
      "meaning_ja": "不名誉の烙印",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1164,
      "word": "charade",
      "meaning_ja": "見せかけ；茶番",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1165,
      "word": "foray",
      "meaning_ja": "新分野への進出；急襲",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1166,
      "word": "delusion",
      "meaning_ja": "妄想；思い違い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1167,
      "word": "restitution",
      "meaning_ja": "返還；賠償",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1168,
      "word": "trajectory",
      "meaning_ja": "軌道",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1169,
      "word": "precinct",
      "meaning_ja": "管区；地区",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1170,
      "word": "dexterity",
      "meaning_ja": "器用さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1171,
      "word": "interlude",
      "meaning_ja": "幕間；合間",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1172,
      "word": "vestige",
      "meaning_ja": "痕跡",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1173,
      "word": "blight",
      "meaning_ja": "荒廃させるもの；枯らす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1174,
      "word": "savvy",
      "meaning_ja": "実用的な知識；事情に通じた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1175,
      "word": "inveterate",
      "meaning_ja": "根深い；常習的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1176,
      "word": "illustrious",
      "meaning_ja": "著名な；輝かしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1177,
      "word": "gallant",
      "meaning_ja": "勇敢な；女性に礼儀正しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1178,
      "word": "volatile",
      "meaning_ja": "変わりやすい；揮発性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1179,
      "word": "forlorn",
      "meaning_ja": "孤独で悲しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1180,
      "word": "reticent",
      "meaning_ja": "寡黙な；控えめな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1181,
      "word": "inept",
      "meaning_ja": "不器用な；無能な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1182,
      "word": "insular",
      "meaning_ja": "島の；閉鎖的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1183,
      "word": "scrupulous",
      "meaning_ja": "良心的な；細心の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1184,
      "word": "cerebral",
      "meaning_ja": "大脳の；知的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1185,
      "word": "indignant",
      "meaning_ja": "憤慨した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1186,
      "word": "decrepit",
      "meaning_ja": "老朽化した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1187,
      "word": "dreary",
      "meaning_ja": "陰鬱な；退屈な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1188,
      "word": "furtive",
      "meaning_ja": "こそこそした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1189,
      "word": "illicit",
      "meaning_ja": "違法な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1190,
      "word": "obstinate",
      "meaning_ja": "頑固な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1191,
      "word": "morose",
      "meaning_ja": "不機嫌で無口な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1192,
      "word": "intrepid",
      "meaning_ja": "勇敢な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1193,
      "word": "palpable",
      "meaning_ja": "明白な；触知できる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1194,
      "word": "abominable",
      "meaning_ja": "忌まわしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1195,
      "word": "nebulous",
      "meaning_ja": "漠然とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1196,
      "word": "void",
      "meaning_ja": "無効の；空白",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1197,
      "word": "soggy",
      "meaning_ja": "水浸しの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1198,
      "word": "subservient",
      "meaning_ja": "従属的な；卑屈な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1199,
      "word": "residual",
      "meaning_ja": "残りの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1200,
      "word": "inject",
      "meaning_ja": "注射する；注入する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1201,
      "word": "flourish",
      "meaning_ja": "繁栄する；盛んになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1202,
      "word": "parallel",
      "meaning_ja": "並行する；類似した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1203,
      "word": "conquer",
      "meaning_ja": "征服する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1204,
      "word": "dictate",
      "meaning_ja": "命令する；書き取らせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1205,
      "word": "expel",
      "meaning_ja": "追放する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1206,
      "word": "stabilize",
      "meaning_ja": "安定させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1207,
      "word": "circulate",
      "meaning_ja": "循環する；流布する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1208,
      "word": "signify",
      "meaning_ja": "意味する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1209,
      "word": "hinder",
      "meaning_ja": "妨げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1210,
      "word": "merge",
      "meaning_ja": "合併する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1211,
      "word": "oppress",
      "meaning_ja": "抑圧する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1212,
      "word": "revive",
      "meaning_ja": "復活させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1213,
      "word": "excel",
      "meaning_ja": "秀でる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1214,
      "word": "contaminate",
      "meaning_ja": "汚染する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1215,
      "word": "concede",
      "meaning_ja": "認める；譲歩する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1216,
      "word": "amend",
      "meaning_ja": "修正する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1217,
      "word": "retrieve",
      "meaning_ja": "取り戻す；検索する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1218,
      "word": "foresee",
      "meaning_ja": "予見する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1219,
      "word": "repress",
      "meaning_ja": "抑圧する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1220,
      "word": "overrun",
      "meaning_ja": "侵略する；超過する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1221,
      "word": "elaborate",
      "meaning_ja": "詳しく述べる；精巧な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1222,
      "word": "rally",
      "meaning_ja": "結集する；回復する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1223,
      "word": "outrage",
      "meaning_ja": "激怒；憤慨させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1224,
      "word": "deception",
      "meaning_ja": "欺くこと",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1225,
      "word": "biodiversity",
      "meaning_ja": "生物多様性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1226,
      "word": "fertilizer",
      "meaning_ja": "肥料",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1227,
      "word": "sovereignty",
      "meaning_ja": "主権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1228,
      "word": "autonomy",
      "meaning_ja": "自治；自律",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1229,
      "word": "starvation",
      "meaning_ja": "飢餓",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1230,
      "word": "cortex",
      "meaning_ja": "皮質",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1231,
      "word": "setback",
      "meaning_ja": "挫折；後退",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1232,
      "word": "intuition",
      "meaning_ja": "直感",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1233,
      "word": "expenditure",
      "meaning_ja": "支出",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1234,
      "word": "domain",
      "meaning_ja": "領域",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1235,
      "word": "counterpart",
      "meaning_ja": "対応する人物・物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1236,
      "word": "monopoly",
      "meaning_ja": "独占",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1237,
      "word": "coverage",
      "meaning_ja": "報道；補償範囲",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1238,
      "word": "paleontologist",
      "meaning_ja": "古生物学者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1239,
      "word": "stakeholder",
      "meaning_ja": "利害関係者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1240,
      "word": "psychiatrist",
      "meaning_ja": "精神科医",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1241,
      "word": "casualty",
      "meaning_ja": "死傷者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1242,
      "word": "reign",
      "meaning_ja": "治世；君臨する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1243,
      "word": "triumph",
      "meaning_ja": "勝利；勝ち誇る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1244,
      "word": "surplus",
      "meaning_ja": "余剰",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1245,
      "word": "acquisition",
      "meaning_ja": "獲得；買収",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1246,
      "word": "photosynthesis",
      "meaning_ja": "光合成",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1247,
      "word": "resolution",
      "meaning_ja": "決議；解決；解像度",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1248,
      "word": "basin",
      "meaning_ja": "盆地；流域；洗面器",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1249,
      "word": "hallmark",
      "meaning_ja": "特徴；品質保証の刻印",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1250,
      "word": "quota",
      "meaning_ja": "割当量",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1251,
      "word": "realm",
      "meaning_ja": "領域；王国",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1252,
      "word": "metaphor",
      "meaning_ja": "比喩",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1253,
      "word": "advent",
      "meaning_ja": "出現；到来",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1254,
      "word": "prevalence",
      "meaning_ja": "普及；有病率",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1255,
      "word": "exploitation",
      "meaning_ja": "搾取；利用",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1256,
      "word": "oversight",
      "meaning_ja": "見落とし；監督",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1257,
      "word": "synthesis",
      "meaning_ja": "統合；合成",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1258,
      "word": "toxin",
      "meaning_ja": "毒素",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1259,
      "word": "tolerance",
      "meaning_ja": "寛容；耐性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1260,
      "word": "rein",
      "meaning_ja": "手綱；抑制する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1261,
      "word": "antibiotic",
      "meaning_ja": "抗生物質",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1262,
      "word": "covenant",
      "meaning_ja": "契約；盟約",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1263,
      "word": "populace",
      "meaning_ja": "一般大衆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1264,
      "word": "uproar",
      "meaning_ja": "騒動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1265,
      "word": "massacre",
      "meaning_ja": "虐殺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1266,
      "word": "spectrum",
      "meaning_ja": "範囲；スペクトル",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1267,
      "word": "justification",
      "meaning_ja": "正当化；根拠",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1268,
      "word": "stalemate",
      "meaning_ja": "膠着状態",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1269,
      "word": "schizophrenia",
      "meaning_ja": "統合失調症",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1270,
      "word": "restoration",
      "meaning_ja": "復元；復旧",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1271,
      "word": "archive",
      "meaning_ja": "記録保管所；保存する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1272,
      "word": "niche",
      "meaning_ja": "適所；市場の隙間",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1273,
      "word": "transaction",
      "meaning_ja": "取引",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1274,
      "word": "margin",
      "meaning_ja": "余白；差；利益幅",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1275,
      "word": "legislature",
      "meaning_ja": "立法府",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1276,
      "word": "pharmaceutical",
      "meaning_ja": "製薬の；医薬品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1277,
      "word": "subtle",
      "meaning_ja": "微妙な；巧妙な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1278,
      "word": "paradoxical",
      "meaning_ja": "逆説的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1279,
      "word": "communal",
      "meaning_ja": "共同の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1280,
      "word": "authentic",
      "meaning_ja": "本物の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1281,
      "word": "instrumental",
      "meaning_ja": "役立つ；器楽の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1282,
      "word": "humanitarian",
      "meaning_ja": "人道的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1283,
      "word": "adverse",
      "meaning_ja": "不利な；有害な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1284,
      "word": "paramount",
      "meaning_ja": "最重要の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1285,
      "word": "administrative",
      "meaning_ja": "行政の；管理の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1286,
      "word": "invertebrate",
      "meaning_ja": "無脊椎動物；無脊椎の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1287,
      "word": "staggering",
      "meaning_ja": "驚くほどの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1288,
      "word": "integral",
      "meaning_ja": "不可欠な；一体の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1289,
      "word": "exempt",
      "meaning_ja": "免除された；免除する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1290,
      "word": "infamous",
      "meaning_ja": "悪名高い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1291,
      "word": "formidable",
      "meaning_ja": "手ごわい；恐るべき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1292,
      "word": "microscopic",
      "meaning_ja": "顕微鏡でしか見えない；極小の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1293,
      "word": "cynical",
      "meaning_ja": "冷笑的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1294,
      "word": "potent",
      "meaning_ja": "強力な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1295,
      "word": "disciplinary",
      "meaning_ja": "懲戒の；規律上の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1296,
      "word": "invalid",
      "meaning_ja": "無効な；病人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1297,
      "word": "commonplace",
      "meaning_ja": "ありふれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1298,
      "word": "accountable",
      "meaning_ja": "責任を負う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1299,
      "word": "vicious",
      "meaning_ja": "悪意のある；凶暴な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1300,
      "word": "proclaim",
      "meaning_ja": "宣言する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1301,
      "word": "rehabilitate",
      "meaning_ja": "社会復帰させる；リハビリを行う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1302,
      "word": "flock",
      "meaning_ja": "群れ；群がる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1303,
      "word": "precede",
      "meaning_ja": "先行する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1304,
      "word": "strive",
      "meaning_ja": "懸命に努力する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1305,
      "word": "curb",
      "meaning_ja": "抑える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1306,
      "word": "soar",
      "meaning_ja": "急上昇する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1307,
      "word": "shatter",
      "meaning_ja": "粉砕する；打ち砕く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1308,
      "word": "commence",
      "meaning_ja": "開始する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1309,
      "word": "confer",
      "meaning_ja": "授与する；協議する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1310,
      "word": "validate",
      "meaning_ja": "有効性を確認する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1311,
      "word": "impede",
      "meaning_ja": "妨げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1312,
      "word": "penetrate",
      "meaning_ja": "貫通する；浸透する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1313,
      "word": "stoke",
      "meaning_ja": "火をたく；煽る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1314,
      "word": "despise",
      "meaning_ja": "軽蔑する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1315,
      "word": "embark",
      "meaning_ja": "着手する；乗船する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1316,
      "word": "drain",
      "meaning_ja": "排水する；消耗させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1317,
      "word": "presume",
      "meaning_ja": "推定する；あえてする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1318,
      "word": "conserve",
      "meaning_ja": "保護する；節約する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1319,
      "word": "unfold",
      "meaning_ja": "展開する；広げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1320,
      "word": "diversify",
      "meaning_ja": "多様化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1321,
      "word": "resume",
      "meaning_ja": "再開する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1322,
      "word": "downplay",
      "meaning_ja": "軽く扱う；過小評価する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1323,
      "word": "probe",
      "meaning_ja": "調査する；探査機",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1324,
      "word": "simulate",
      "meaning_ja": "模擬実験する；まねる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1325,
      "word": "prosecute",
      "meaning_ja": "起訴する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1326,
      "word": "eradicate",
      "meaning_ja": "根絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1327,
      "word": "intrude",
      "meaning_ja": "侵入する；立ち入る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1328,
      "word": "scatter",
      "meaning_ja": "散らす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1329,
      "word": "implicate",
      "meaning_ja": "関与を示す；巻き込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1330,
      "word": "evacuate",
      "meaning_ja": "避難させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1331,
      "word": "evaporate",
      "meaning_ja": "蒸発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1332,
      "word": "evoke",
      "meaning_ja": "呼び起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1333,
      "word": "empower",
      "meaning_ja": "権限を与える；力を付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1334,
      "word": "mimic",
      "meaning_ja": "まねる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1335,
      "word": "inscription",
      "meaning_ja": "碑文；銘",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1336,
      "word": "proposition",
      "meaning_ja": "提案；命題",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1337,
      "word": "entrepreneur",
      "meaning_ja": "起業家",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1338,
      "word": "clarity",
      "meaning_ja": "明瞭さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1339,
      "word": "utility",
      "meaning_ja": "有用性；公共事業",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1340,
      "word": "sanitation",
      "meaning_ja": "公衆衛生",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1341,
      "word": "parasite",
      "meaning_ja": "寄生生物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1342,
      "word": "incidence",
      "meaning_ja": "発生率",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1343,
      "word": "outcry",
      "meaning_ja": "激しい抗議",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1344,
      "word": "integrity",
      "meaning_ja": "誠実さ；完全性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1345,
      "word": "dwelling",
      "meaning_ja": "住居",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1346,
      "word": "archaeology",
      "meaning_ja": "考古学",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1347,
      "word": "dynasty",
      "meaning_ja": "王朝",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1348,
      "word": "retina",
      "meaning_ja": "網膜",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1349,
      "word": "hygiene",
      "meaning_ja": "衛生",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1350,
      "word": "pretense",
      "meaning_ja": "見せかけ；口実",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1351,
      "word": "refuge",
      "meaning_ja": "避難；避難所",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1352,
      "word": "foe",
      "meaning_ja": "敵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1353,
      "word": "obedience",
      "meaning_ja": "服従",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1354,
      "word": "atheist",
      "meaning_ja": "無神論者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1355,
      "word": "contempt",
      "meaning_ja": "軽蔑",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1356,
      "word": "conversion",
      "meaning_ja": "転換；改宗",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1357,
      "word": "anthropology",
      "meaning_ja": "人類学",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1358,
      "word": "deficiency",
      "meaning_ja": "欠乏；欠陥",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1359,
      "word": "liberation",
      "meaning_ja": "解放",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1360,
      "word": "plunge",
      "meaning_ja": "突っ込む；急落",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1361,
      "word": "solidarity",
      "meaning_ja": "連帯",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1362,
      "word": "confrontation",
      "meaning_ja": "対立",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1363,
      "word": "novelty",
      "meaning_ja": "新しさ；珍しい物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1364,
      "word": "projection",
      "meaning_ja": "予測；投影",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1365,
      "word": "layman",
      "meaning_ja": "素人；一般信徒",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1366,
      "word": "vein",
      "meaning_ja": "静脈；鉱脈",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1367,
      "word": "cluster",
      "meaning_ja": "集団；集まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1368,
      "word": "benchmark",
      "meaning_ja": "基準；指標",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1369,
      "word": "fatality",
      "meaning_ja": "死亡者；死亡事故",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1370,
      "word": "wreckage",
      "meaning_ja": "残骸",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1371,
      "word": "specification",
      "meaning_ja": "仕様；明細",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1372,
      "word": "parameter",
      "meaning_ja": "条件；変数",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1373,
      "word": "swarm",
      "meaning_ja": "群れ；群がる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1374,
      "word": "neurologist",
      "meaning_ja": "神経科医",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1375,
      "word": "hazard",
      "meaning_ja": "危険",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1376,
      "word": "upstart",
      "meaning_ja": "成り上がり者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1377,
      "word": "intact",
      "meaning_ja": "無傷の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1378,
      "word": "solitary",
      "meaning_ja": "単独の；孤独な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1379,
      "word": "electoral",
      "meaning_ja": "選挙の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1380,
      "word": "oriented",
      "meaning_ja": "特定の方向を向いた；重視する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1381,
      "word": "reliant",
      "meaning_ja": "頼っている",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1382,
      "word": "mandatory",
      "meaning_ja": "義務的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1383,
      "word": "seamless",
      "meaning_ja": "継ぎ目のない；円滑な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1384,
      "word": "chaotic",
      "meaning_ja": "混沌とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1385,
      "word": "holistic",
      "meaning_ja": "全体的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1386,
      "word": "vibrant",
      "meaning_ja": "活気のある；鮮やかな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1387,
      "word": "obsessive",
      "meaning_ja": "強迫的な；取りつかれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1388,
      "word": "alternate",
      "meaning_ja": "交互の；交代する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1389,
      "word": "spontaneous",
      "meaning_ja": "自発的な；自然発生の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1390,
      "word": "unilateral",
      "meaning_ja": "一方的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1391,
      "word": "notorious",
      "meaning_ja": "悪名高い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1392,
      "word": "finite",
      "meaning_ja": "有限の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1393,
      "word": "barren",
      "meaning_ja": "不毛な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1394,
      "word": "tribal",
      "meaning_ja": "部族の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1395,
      "word": "preferential",
      "meaning_ja": "優遇する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1396,
      "word": "invariably",
      "meaning_ja": "常に；例外なく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1397,
      "word": "abruptly",
      "meaning_ja": "突然に；ぶっきらぼうに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1398,
      "word": "exclusively",
      "meaning_ja": "もっぱら；独占的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1399,
      "word": "allegedly",
      "meaning_ja": "伝えられるところでは",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1400,
      "word": "taint",
      "meaning_ja": "汚す；汚点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1401,
      "word": "shimmer",
      "meaning_ja": "かすかに揺らめく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1402,
      "word": "forage",
      "meaning_ja": "食料を探す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1403,
      "word": "entangle",
      "meaning_ja": "絡ませる；巻き込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1404,
      "word": "ruffle",
      "meaning_ja": "波立たせる；いら立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1405,
      "word": "enthrall",
      "meaning_ja": "魅了する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1406,
      "word": "undermine",
      "meaning_ja": "弱体化させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1407,
      "word": "slash",
      "meaning_ja": "大幅に削減する；切りつける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1408,
      "word": "amplify",
      "meaning_ja": "増幅する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1409,
      "word": "galvanize",
      "meaning_ja": "奮い立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1410,
      "word": "poach",
      "meaning_ja": "密猟する；引き抜く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1411,
      "word": "replenish",
      "meaning_ja": "補充する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1412,
      "word": "depict",
      "meaning_ja": "描写する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1413,
      "word": "spurn",
      "meaning_ja": "拒絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1414,
      "word": "harness",
      "meaning_ja": "利用する；馬具",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1415,
      "word": "incriminate",
      "meaning_ja": "有罪を示す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1416,
      "word": "topple",
      "meaning_ja": "倒す；転覆する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1417,
      "word": "dispatch",
      "meaning_ja": "派遣する；発送する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1418,
      "word": "anoint",
      "meaning_ja": "油を塗って聖別する；後継者に選ぶ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1419,
      "word": "supplant",
      "meaning_ja": "取って代わる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1420,
      "word": "deface",
      "meaning_ja": "外観を損なう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1421,
      "word": "embroil",
      "meaning_ja": "巻き込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1422,
      "word": "rankle",
      "meaning_ja": "心にわだかまる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1423,
      "word": "revert",
      "meaning_ja": "元に戻る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1424,
      "word": "deploy",
      "meaning_ja": "配備する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1425,
      "word": "deprecate",
      "meaning_ja": "非難する；好ましくないとする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1426,
      "word": "drench",
      "meaning_ja": "びしょぬれにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1427,
      "word": "defame",
      "meaning_ja": "名誉を傷つける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1428,
      "word": "rupture",
      "meaning_ja": "破裂；破裂する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1429,
      "word": "tally",
      "meaning_ja": "集計；一致する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1430,
      "word": "splurge",
      "meaning_ja": "散財する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1431,
      "word": "jeer",
      "meaning_ja": "あざける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1432,
      "word": "enchant",
      "meaning_ja": "魅了する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1433,
      "word": "hibernate",
      "meaning_ja": "冬眠する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1434,
      "word": "tycoon",
      "meaning_ja": "大物実業家",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1435,
      "word": "partisan",
      "meaning_ja": "熱烈な支持者；党派的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1436,
      "word": "ruse",
      "meaning_ja": "策略",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1437,
      "word": "conglomeratio",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 1438,
      "word": "piety",
      "meaning_ja": "信心深さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1439,
      "word": "scourge",
      "meaning_ja": "災厄；苦しめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1440,
      "word": "sham",
      "meaning_ja": "偽物；見せかけの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1441,
      "word": "remission",
      "meaning_ja": "病状の寛解；減免",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1442,
      "word": "perforation",
      "meaning_ja": "穴；穿孔",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1443,
      "word": "renunciation",
      "meaning_ja": "放棄；断念",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1444,
      "word": "famine",
      "meaning_ja": "飢饉",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1445,
      "word": "disposition",
      "meaning_ja": "気質；配置",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1446,
      "word": "gadget",
      "meaning_ja": "小型の便利な器具",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1447,
      "word": "threshold",
      "meaning_ja": "敷居；限界値；始まり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1448,
      "word": "mortality",
      "meaning_ja": "死亡率；死すべき運命",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1449,
      "word": "dissertation",
      "meaning_ja": "学位論文",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1450,
      "word": "expulsion",
      "meaning_ja": "追放",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1451,
      "word": "impulse",
      "meaning_ja": "衝動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1452,
      "word": "remittance",
      "meaning_ja": "送金",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1453,
      "word": "remuneration",
      "meaning_ja": "報酬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1454,
      "word": "allegory",
      "meaning_ja": "寓話；寓意",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1455,
      "word": "connotation",
      "meaning_ja": "含意；言外の意味",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1456,
      "word": "aspiration",
      "meaning_ja": "大志；願望",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1457,
      "word": "multitude",
      "meaning_ja": "多数；群衆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1458,
      "word": "paucity",
      "meaning_ja": "不足",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1459,
      "word": "tyranny",
      "meaning_ja": "圧政",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1460,
      "word": "deity",
      "meaning_ja": "神；神性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1461,
      "word": "facet",
      "meaning_ja": "側面",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1462,
      "word": "duplicity",
      "meaning_ja": "表裏のある言動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1463,
      "word": "spree",
      "meaning_ja": "やりたい放題の期間",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1464,
      "word": "alacrity",
      "meaning_ja": "敏速さ；快活な意欲",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1465,
      "word": "clemency",
      "meaning_ja": "寛大な処置",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1466,
      "word": "inclination",
      "meaning_ja": "傾向；傾斜",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1467,
      "word": "periphery",
      "meaning_ja": "周辺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1468,
      "word": "absurdity",
      "meaning_ja": "不合理；ばかげたこと",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1469,
      "word": "insurrection",
      "meaning_ja": "反乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1470,
      "word": "platitude",
      "meaning_ja": "陳腐な決まり文句",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1471,
      "word": "revelation",
      "meaning_ja": "暴露；啓示",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1472,
      "word": "advocate",
      "meaning_ja": "支持する；提唱者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1473,
      "word": "sabotage",
      "meaning_ja": "破壊工作；妨害する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1474,
      "word": "cranky",
      "meaning_ja": "気難しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1475,
      "word": "eclectic",
      "meaning_ja": "折衷的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1476,
      "word": "delirious",
      "meaning_ja": "意識が混濁した；大喜びの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1477,
      "word": "pensive",
      "meaning_ja": "物思いに沈んだ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1478,
      "word": "circumspect",
      "meaning_ja": "慎重な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1479,
      "word": "poised",
      "meaning_ja": "落ち着いた；準備ができた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1480,
      "word": "irascible",
      "meaning_ja": "怒りっぽい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1481,
      "word": "implicit",
      "meaning_ja": "暗黙の；内在する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1482,
      "word": "deceased",
      "meaning_ja": "亡くなった",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1483,
      "word": "rampant",
      "meaning_ja": "蔓延する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1484,
      "word": "jubilant",
      "meaning_ja": "大喜びの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1485,
      "word": "imminent",
      "meaning_ja": "差し迫った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1486,
      "word": "rigorous",
      "meaning_ja": "厳密な；厳しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1487,
      "word": "inanimate",
      "meaning_ja": "無生物の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1488,
      "word": "coarse",
      "meaning_ja": "粗い；下品な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1489,
      "word": "prodigious",
      "meaning_ja": "驚異的な；莫大な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1490,
      "word": "tangible",
      "meaning_ja": "具体的な；触れられる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1491,
      "word": "opaque",
      "meaning_ja": "不透明な；分かりにくい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1492,
      "word": "conscientious",
      "meaning_ja": "良心的な；念入りな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1493,
      "word": "pernicious",
      "meaning_ja": "有害な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1494,
      "word": "latent",
      "meaning_ja": "潜在的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1495,
      "word": "onerous",
      "meaning_ja": "負担の大きい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1496,
      "word": "reciprocal",
      "meaning_ja": "相互の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1497,
      "word": "scruffy",
      "meaning_ja": "みすぼらしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1498,
      "word": "ruefully",
      "meaning_ja": "後悔して；悲しげに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1499,
      "word": "nominally",
      "meaning_ja": "名目上は",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1500,
      "word": "beguile",
      "meaning_ja": "魅了する；だます",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1501,
      "word": "modulate",
      "meaning_ja": "調節する；転調する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1502,
      "word": "adjudicate",
      "meaning_ja": "裁定する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1503,
      "word": "distend",
      "meaning_ja": "膨張させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1504,
      "word": "acclaim",
      "meaning_ja": "称賛する；称賛",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1505,
      "word": "abduct",
      "meaning_ja": "誘拐する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1506,
      "word": "usurp",
      "meaning_ja": "奪い取る；簒奪する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1507,
      "word": "articulate",
      "meaning_ja": "明確に表現する；明瞭な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1508,
      "word": "exult",
      "meaning_ja": "歓喜する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1509,
      "word": "truncate",
      "meaning_ja": "切り詰める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1510,
      "word": "bombard",
      "meaning_ja": "砲撃する；質問を浴びせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1511,
      "word": "dissent",
      "meaning_ja": "異議；異議を唱える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1512,
      "word": "mitigate",
      "meaning_ja": "軽減する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1513,
      "word": "disavow",
      "meaning_ja": "否認する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1514,
      "word": "corrode",
      "meaning_ja": "腐食する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1515,
      "word": "spare",
      "meaning_ja": "割く；免れさせる；予備の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1516,
      "word": "solicit",
      "meaning_ja": "懇願する；募る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1517,
      "word": "jiggle",
      "meaning_ja": "軽く揺する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1518,
      "word": "upend",
      "meaning_ja": "ひっくり返す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1519,
      "word": "clobber",
      "meaning_ja": "ひどく殴る；打ち負かす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1520,
      "word": "muddle",
      "meaning_ja": "混乱させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1521,
      "word": "irk",
      "meaning_ja": "いら立たせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1522,
      "word": "derive",
      "meaning_ja": "由来する；引き出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1523,
      "word": "tilt",
      "meaning_ja": "傾ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1524,
      "word": "flinch",
      "meaning_ja": "ひるむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1525,
      "word": "maim",
      "meaning_ja": "重傷を負わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1526,
      "word": "trudge",
      "meaning_ja": "重い足取りで歩く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1527,
      "word": "lubricate",
      "meaning_ja": "潤滑油を差す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1528,
      "word": "extrapolate",
      "meaning_ja": "既知の情報から推定する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1529,
      "word": "impeach",
      "meaning_ja": "弾劾する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1530,
      "word": "obfuscate",
      "meaning_ja": "わざと分かりにくくする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1531,
      "word": "censure",
      "meaning_ja": "厳しく非難する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1532,
      "word": "agonize",
      "meaning_ja": "苦悩する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1533,
      "word": "lull",
      "meaning_ja": "落ち着かせる；小康状態",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1534,
      "word": "fray",
      "meaning_ja": "ほつれる；争い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1535,
      "word": "twitch",
      "meaning_ja": "ぴくっと動く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1536,
      "word": "emancipate",
      "meaning_ja": "解放する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1537,
      "word": "dividend",
      "meaning_ja": "配当；利益",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1538,
      "word": "tinge",
      "meaning_ja": "色合い；わずかな気配",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1539,
      "word": "onslaught",
      "meaning_ja": "猛攻撃",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1540,
      "word": "creed",
      "meaning_ja": "信条",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1541,
      "word": "conveyance",
      "meaning_ja": "運搬；乗り物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1542,
      "word": "felicity",
      "meaning_ja": "幸福；表現の巧みさ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1543,
      "word": "conjunction",
      "meaning_ja": "結合；接続詞",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1544,
      "word": "scarcity",
      "meaning_ja": "不足；希少",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1545,
      "word": "gratuity",
      "meaning_ja": "心付け；退職手当",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1546,
      "word": "whim",
      "meaning_ja": "気まぐれ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1547,
      "word": "perjury",
      "meaning_ja": "偽証",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1548,
      "word": "incarnation",
      "meaning_ja": "化身",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1549,
      "word": "fortitude",
      "meaning_ja": "不屈の精神",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1550,
      "word": "truancy",
      "meaning_ja": "無断欠席",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1551,
      "word": "ledger",
      "meaning_ja": "帳簿",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1552,
      "word": "equilibrium",
      "meaning_ja": "均衡",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1553,
      "word": "schism",
      "meaning_ja": "分裂",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1554,
      "word": "epiphany",
      "meaning_ja": "突然の悟り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1555,
      "word": "attrition",
      "meaning_ja": "消耗；自然減",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1556,
      "word": "cove",
      "meaning_ja": "入り江",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1557,
      "word": "cavity",
      "meaning_ja": "空洞；虫歯の穴",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1558,
      "word": "aberration",
      "meaning_ja": "異常；逸脱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1559,
      "word": "enigma",
      "meaning_ja": "謎",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1560,
      "word": "euphoria",
      "meaning_ja": "多幸感",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1561,
      "word": "predilection",
      "meaning_ja": "好み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1562,
      "word": "affinity",
      "meaning_ja": "親近感；類似性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1563,
      "word": "remnant",
      "meaning_ja": "残り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1564,
      "word": "velocity",
      "meaning_ja": "速度",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1565,
      "word": "configuration",
      "meaning_ja": "配置；構成",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1566,
      "word": "progeny",
      "meaning_ja": "子孫",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1567,
      "word": "rendezvous",
      "meaning_ja": "待ち合わせ；会合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1568,
      "word": "satire",
      "meaning_ja": "風刺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1569,
      "word": "mandate",
      "meaning_ja": "命令；権限；委任",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1570,
      "word": "ingenious",
      "meaning_ja": "独創的な；巧妙な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1571,
      "word": "malevolent",
      "meaning_ja": "悪意のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1572,
      "word": "bucolic",
      "meaning_ja": "田園の；牧歌的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1573,
      "word": "exponential",
      "meaning_ja": "指数関数的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1574,
      "word": "incongruous",
      "meaning_ja": "不釣り合いな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1575,
      "word": "eloquent",
      "meaning_ja": "雄弁な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1576,
      "word": "ferocious",
      "meaning_ja": "凶暴な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1577,
      "word": "profane",
      "meaning_ja": "不敬な；俗の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1578,
      "word": "incisive",
      "meaning_ja": "鋭い；的確な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1579,
      "word": "tenuous",
      "meaning_ja": "薄弱な；かすかな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1580,
      "word": "ambient",
      "meaning_ja": "周囲の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1581,
      "word": "cursory",
      "meaning_ja": "ざっとした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1582,
      "word": "terse",
      "meaning_ja": "簡潔でそっけない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1583,
      "word": "erudite",
      "meaning_ja": "博識の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1584,
      "word": "odious",
      "meaning_ja": "忌まわしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1585,
      "word": "pompous",
      "meaning_ja": "尊大な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1586,
      "word": "truculent",
      "meaning_ja": "攻撃的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1587,
      "word": "ostensible",
      "meaning_ja": "表向きの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1588,
      "word": "colloquial",
      "meaning_ja": "口語の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1589,
      "word": "insolent",
      "meaning_ja": "横柄な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1590,
      "word": "egregious",
      "meaning_ja": "甚だしい；言語道断の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1591,
      "word": "luminous",
      "meaning_ja": "光を放つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1592,
      "word": "amenable",
      "meaning_ja": "従順な；受け入れる用意がある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1593,
      "word": "elated",
      "meaning_ja": "大喜びの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1594,
      "word": "ludicrous",
      "meaning_ja": "ばかげた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1595,
      "word": "suave",
      "meaning_ja": "物腰の柔らかい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1596,
      "word": "sullen",
      "meaning_ja": "むっつりした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1597,
      "word": "incumbent",
      "meaning_ja": "現職の；義務である",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1598,
      "word": "fortuitously",
      "meaning_ja": "偶然に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1599,
      "word": "cordially",
      "meaning_ja": "心から；親しみを込めて",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1600,
      "word": "retract",
      "meaning_ja": "撤回する；引っ込める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1601,
      "word": "extradite",
      "meaning_ja": "犯罪人を引き渡す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1602,
      "word": "persecute",
      "meaning_ja": "迫害する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1603,
      "word": "garble",
      "meaning_ja": "言葉を混乱させて伝える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1604,
      "word": "nurture",
      "meaning_ja": "育てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1605,
      "word": "hobble",
      "meaning_ja": "足を引きずる；妨げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1606,
      "word": "incinerate",
      "meaning_ja": "焼却する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1607,
      "word": "invigorate",
      "meaning_ja": "元気付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1608,
      "word": "vilify",
      "meaning_ja": "中傷する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1609,
      "word": "cogitate",
      "meaning_ja": "熟考する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1610,
      "word": "edify",
      "meaning_ja": "教化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1611,
      "word": "percolate",
      "meaning_ja": "染み通る；徐々に広まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1612,
      "word": "reel",
      "meaning_ja": "よろめく；巻き枠",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1613,
      "word": "patronize",
      "meaning_ja": "ひいきにする；見下した態度を取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1614,
      "word": "stutter",
      "meaning_ja": "どもる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1615,
      "word": "acquiesce",
      "meaning_ja": "黙認する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1616,
      "word": "acclimate",
      "meaning_ja": "順応させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1617,
      "word": "foil",
      "meaning_ja": "阻止する；金属箔",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1618,
      "word": "debilitate",
      "meaning_ja": "衰弱させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1619,
      "word": "espouse",
      "meaning_ja": "主義などを支持する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1620,
      "word": "lampoon",
      "meaning_ja": "風刺する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1621,
      "word": "chide",
      "meaning_ja": "叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1622,
      "word": "tabulate",
      "meaning_ja": "表にまとめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1623,
      "word": "incubate",
      "meaning_ja": "孵化させる；培養する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1624,
      "word": "preface",
      "meaning_ja": "序文；前置きする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1625,
      "word": "drool",
      "meaning_ja": "よだれを垂らす；欲しがる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1626,
      "word": "entwine",
      "meaning_ja": "絡み合う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1627,
      "word": "scoff",
      "meaning_ja": "あざ笑う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1628,
      "word": "amass",
      "meaning_ja": "蓄積する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1629,
      "word": "crumple",
      "meaning_ja": "しわくちゃにする；崩れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1630,
      "word": "loiter",
      "meaning_ja": "ぶらぶらする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1631,
      "word": "billow",
      "meaning_ja": "大きく波打つ；膨らむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1632,
      "word": "bungle",
      "meaning_ja": "しくじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1633,
      "word": "wrangle",
      "meaning_ja": "言い争う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1634,
      "word": "coddle",
      "meaning_ja": "甘やかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1635,
      "word": "crucify",
      "meaning_ja": "十字架にかける；酷評する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1636,
      "word": "devour",
      "meaning_ja": "むさぼり食う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1637,
      "word": "forestall",
      "meaning_ja": "先手を打って防ぐ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1638,
      "word": "emanate",
      "meaning_ja": "発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1639,
      "word": "parch",
      "meaning_ja": "干からびさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1640,
      "word": "tether",
      "meaning_ja": "つなぎ留める；つなぎ綱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1641,
      "word": "binge",
      "meaning_ja": "暴飲暴食；度を越して熱中する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1642,
      "word": "siphon",
      "meaning_ja": "吸い上げる；不正に流用する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1643,
      "word": "proffer",
      "meaning_ja": "差し出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1644,
      "word": "stampede",
      "meaning_ja": "群衆が殺到する；暴走",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1645,
      "word": "veracity",
      "meaning_ja": "真実性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1646,
      "word": "spasm",
      "meaning_ja": "けいれん",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1647,
      "word": "tremor",
      "meaning_ja": "震え；微震",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1648,
      "word": "effigy",
      "meaning_ja": "人形；肖像",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1649,
      "word": "hegemony",
      "meaning_ja": "覇権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1650,
      "word": "crevice",
      "meaning_ja": "割れ目",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1651,
      "word": "quagmire",
      "meaning_ja": "泥沼；苦境",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1652,
      "word": "lunge",
      "meaning_ja": "突進する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1653,
      "word": "autocrat",
      "meaning_ja": "独裁者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1654,
      "word": "blurb",
      "meaning_ja": "宣伝文句",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1655,
      "word": "disclaimer",
      "meaning_ja": "免責事項；否認声明",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1656,
      "word": "fringe",
      "meaning_ja": "周辺；房飾り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1657,
      "word": "abstinence",
      "meaning_ja": "禁欲；節制",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1658,
      "word": "trepidation",
      "meaning_ja": "不安；おののき",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1659,
      "word": "fissure",
      "meaning_ja": "裂け目",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1660,
      "word": "heist",
      "meaning_ja": "強盗",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1661,
      "word": "rig",
      "meaning_ja": "装備する；不正操作する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1662,
      "word": "sreverie",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 1663,
      "word": "bastion",
      "meaning_ja": "とりで；最後の拠点",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1664,
      "word": "synopsis",
      "meaning_ja": "概要",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1665,
      "word": "commendation",
      "meaning_ja": "称賛；表彰",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1666,
      "word": "tirade",
      "meaning_ja": "長々とした激しい非難",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1667,
      "word": "clatter",
      "meaning_ja": "がたがたいう音",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1668,
      "word": "abrasive",
      "meaning_ja": "研磨用の；とげとげしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1669,
      "word": "nimble",
      "meaning_ja": "敏捷な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1670,
      "word": "penitent",
      "meaning_ja": "後悔した；悔い改めた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1671,
      "word": "vulgar",
      "meaning_ja": "下品な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1672,
      "word": "grim",
      "meaning_ja": "厳しい；陰惨な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1673,
      "word": "indolent",
      "meaning_ja": "怠惰な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1674,
      "word": "rancid",
      "meaning_ja": "油脂が腐った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1675,
      "word": "cogent",
      "meaning_ja": "説得力のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1676,
      "word": "flippant",
      "meaning_ja": "軽薄な；不謹慎な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1677,
      "word": "genial",
      "meaning_ja": "愛想のよい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1678,
      "word": "delectable",
      "meaning_ja": "非常においしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1679,
      "word": "subliminal",
      "meaning_ja": "潜在意識に働きかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1680,
      "word": "jocular",
      "meaning_ja": "冗談好きの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1681,
      "word": "laborious",
      "meaning_ja": "骨の折れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1682,
      "word": "sordid",
      "meaning_ja": "卑劣な；不潔な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1683,
      "word": "jovial",
      "meaning_ja": "陽気な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1684,
      "word": "auxiliary",
      "meaning_ja": "補助の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1685,
      "word": "virulent",
      "meaning_ja": "毒性の強い；悪意の強い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1686,
      "word": "dank",
      "meaning_ja": "じめじめした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1687,
      "word": "comatose",
      "meaning_ja": "昏睡状態の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1688,
      "word": "condescending",
      "meaning_ja": "見下したような",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1689,
      "word": "sedate",
      "meaning_ja": "落ち着いた；鎮静させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1690,
      "word": "infantile",
      "meaning_ja": "幼稚な；乳児の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1691,
      "word": "strident",
      "meaning_ja": "耳障りな；激しい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1692,
      "word": "dispassionate",
      "meaning_ja": "冷静で公平な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1693,
      "word": "bereaved",
      "meaning_ja": "近親者を亡くした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1694,
      "word": "scant",
      "meaning_ja": "わずかな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1695,
      "word": "deranged",
      "meaning_ja": "精神が錯乱した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1696,
      "word": "ravenous",
      "meaning_ja": "非常に空腹の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1697,
      "word": "raucous",
      "meaning_ja": "騒々しい；耳障りな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1698,
      "word": "vexing",
      "meaning_ja": "いら立たしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1699,
      "word": "wanton",
      "meaning_ja": "無謀な；理由もなく残酷な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1700,
      "word": "clamp",
      "meaning_ja": "締め付ける；留め具",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1701,
      "word": "faze",
      "meaning_ja": "動揺させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1702,
      "word": "entail",
      "meaning_ja": "必然的に伴う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1703,
      "word": "annihilate",
      "meaning_ja": "全滅させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1704,
      "word": "snarl",
      "meaning_ja": "うなる；怒鳴る；もつれ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1705,
      "word": "renounce",
      "meaning_ja": "放棄する；縁を切る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1706,
      "word": "ameliorate",
      "meaning_ja": "改善する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1707,
      "word": "subsidize",
      "meaning_ja": "補助金を与える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1708,
      "word": "wean",
      "meaning_ja": "離乳させる；徐々にやめさせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1709,
      "word": "embolden",
      "meaning_ja": "勇気付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1710,
      "word": "ruminate",
      "meaning_ja": "熟考する；反芻する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1711,
      "word": "fathom",
      "meaning_ja": "理解する；水深を測る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1712,
      "word": "equivocate",
      "meaning_ja": "曖昧な言葉でごまかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1713,
      "word": "chaperone",
      "meaning_ja": "付き添う；付き添い人",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1714,
      "word": "pollinate",
      "meaning_ja": "受粉させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1715,
      "word": "usher",
      "meaning_ja": "案内する；案内係",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1716,
      "word": "cripple",
      "meaning_ja": "機能を損なう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1717,
      "word": "redeem",
      "meaning_ja": "償う；引き換える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1718,
      "word": "whine",
      "meaning_ja": "愚痴を言う；泣き言を言う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1719,
      "word": "mutate",
      "meaning_ja": "突然変異する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1720,
      "word": "fare",
      "meaning_ja": "うまくやっていく；運賃",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1721,
      "word": "distort",
      "meaning_ja": "歪める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1722,
      "word": "pillage",
      "meaning_ja": "略奪する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1723,
      "word": "slander",
      "meaning_ja": "口頭で中傷する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1724,
      "word": "pledge",
      "meaning_ja": "誓約する；誓約",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1725,
      "word": "recant",
      "meaning_ja": "発言や信仰を撤回する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1726,
      "word": "surmount",
      "meaning_ja": "克服する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1727,
      "word": "jilt",
      "meaning_ja": "恋人を振る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1728,
      "word": "prowl",
      "meaning_ja": "うろつく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1729,
      "word": "chasten",
      "meaning_ja": "懲らしめる；反省させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1730,
      "word": "pitch",
      "meaning_ja": "投げる；売り込む；音の高さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1731,
      "word": "clump",
      "meaning_ja": "塊；群がる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1732,
      "word": "revere",
      "meaning_ja": "深く敬う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1733,
      "word": "ensue",
      "meaning_ja": "結果として起こる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1734,
      "word": "intervene",
      "meaning_ja": "介入する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1735,
      "word": "pulsate",
      "meaning_ja": "脈打つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1736,
      "word": "finesse",
      "meaning_ja": "巧妙な手腕",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1737,
      "word": "veneer",
      "meaning_ja": "化粧板；うわべ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1738,
      "word": "undertone",
      "meaning_ja": "低い声；含み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1739,
      "word": "dent",
      "meaning_ja": "へこみ；損なう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1740,
      "word": "prerogative",
      "meaning_ja": "特権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1741,
      "word": "abyss",
      "meaning_ja": "深淵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1742,
      "word": "equity",
      "meaning_ja": "公平；自己資本",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1743,
      "word": "specter",
      "meaning_ja": "幽霊；不安を与えるもの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1744,
      "word": "posture",
      "meaning_ja": "姿勢；態度",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1745,
      "word": "indictment",
      "meaning_ja": "起訴；告発",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1746,
      "word": "paternity",
      "meaning_ja": "父であること；父性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1747,
      "word": "perseverance",
      "meaning_ja": "忍耐力",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1748,
      "word": "menace",
      "meaning_ja": "脅威；脅す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1749,
      "word": "epitaph",
      "meaning_ja": "墓碑銘",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1750,
      "word": "regimen",
      "meaning_ja": "健康管理の療法・食事法",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1751,
      "word": "plateau",
      "meaning_ja": "高原；停滞期",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1752,
      "word": "pigment",
      "meaning_ja": "顔料；色素",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1753,
      "word": "accreditation",
      "meaning_ja": "認定",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1754,
      "word": "prophecy",
      "meaning_ja": "予言",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1755,
      "word": "efficacy",
      "meaning_ja": "効能",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1756,
      "word": "conspirator",
      "meaning_ja": "共謀者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1757,
      "word": "convalescence",
      "meaning_ja": "病後の回復",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1758,
      "word": "leverage",
      "meaning_ja": "影響力；てこの作用",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1759,
      "word": "treason",
      "meaning_ja": "反逆罪",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1760,
      "word": "tumult",
      "meaning_ja": "騒動",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1761,
      "word": "rhetoric",
      "meaning_ja": "修辞；美辞麗句",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1762,
      "word": "pilgrimage",
      "meaning_ja": "巡礼",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1763,
      "word": "pedestal",
      "meaning_ja": "台座",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1764,
      "word": "inflammation",
      "meaning_ja": "炎症",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1765,
      "word": "cartel",
      "meaning_ja": "企業間の価格・生産協定",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1766,
      "word": "cohort",
      "meaning_ja": "集団；同年齢群",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1767,
      "word": "protagonist",
      "meaning_ja": "主人公；主要人物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1768,
      "word": "speculation",
      "meaning_ja": "推測；投機",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1769,
      "word": "prot",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 1770,
      "word": "conundrum",
      "meaning_ja": "難問",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1771,
      "word": "snare",
      "meaning_ja": "わな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1772,
      "word": "archipelago",
      "meaning_ja": "群島",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1773,
      "word": "apparition",
      "meaning_ja": "幽霊；幻影",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1774,
      "word": "pretext",
      "meaning_ja": "口実",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1775,
      "word": "decree",
      "meaning_ja": "法令；命じる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1776,
      "word": "myriad",
      "meaning_ja": "無数の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1777,
      "word": "unwitting",
      "meaning_ja": "知らずにした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1778,
      "word": "unfounded",
      "meaning_ja": "根拠のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1779,
      "word": "dubious",
      "meaning_ja": "疑わしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1780,
      "word": "statutory",
      "meaning_ja": "法定の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1781,
      "word": "pragmatic",
      "meaning_ja": "実用的な；現実的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1782,
      "word": "cardinal",
      "meaning_ja": "基本的な；枢機卿",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1783,
      "word": "philanthropic",
      "meaning_ja": "慈善の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1784,
      "word": "devout",
      "meaning_ja": "信心深い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1785,
      "word": "lackluster",
      "meaning_ja": "精彩を欠いた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1786,
      "word": "trifling",
      "meaning_ja": "取るに足らない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1787,
      "word": "voracious",
      "meaning_ja": "貪欲な；大食いの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1788,
      "word": "ephemeral",
      "meaning_ja": "はかない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1789,
      "word": "strenuous",
      "meaning_ja": "激しい；多大な努力を要する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1790,
      "word": "vicarious",
      "meaning_ja": "他人を通じて経験する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1791,
      "word": "sparse",
      "meaning_ja": "まばらな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1792,
      "word": "callous",
      "meaning_ja": "冷淡な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1793,
      "word": "vivacious",
      "meaning_ja": "快活な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1794,
      "word": "impetuous",
      "meaning_ja": "衝動的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1795,
      "word": "pliable",
      "meaning_ja": "曲げやすい；柔軟な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1796,
      "word": "nascent",
      "meaning_ja": "生まれつつある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1797,
      "word": "hilarious",
      "meaning_ja": "非常におかしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1798,
      "word": "aghast",
      "meaning_ja": "仰天して",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1799,
      "word": "perpetual",
      "meaning_ja": "絶え間ない；永久の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1800,
      "word": "prune",
      "meaning_ja": "剪定する；削減する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1801,
      "word": "slight",
      "meaning_ja": "わずかな；軽視する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1802,
      "word": "loathe",
      "meaning_ja": "ひどく嫌う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1803,
      "word": "scrounge",
      "meaning_ja": "ねだる；探し回って手に入れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1804,
      "word": "bellow",
      "meaning_ja": "大声で叫ぶ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1805,
      "word": "amputate",
      "meaning_ja": "手足を切断する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1806,
      "word": "scrutinize",
      "meaning_ja": "詳しく調べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1807,
      "word": "incite",
      "meaning_ja": "扇動する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1808,
      "word": "empathize",
      "meaning_ja": "共感する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1809,
      "word": "embody",
      "meaning_ja": "具体化する；体現する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1810,
      "word": "manipulate",
      "meaning_ja": "巧みに操る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1811,
      "word": "foist",
      "meaning_ja": "押し付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1812,
      "word": "deteriorate",
      "meaning_ja": "悪化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1813,
      "word": "arbitrate",
      "meaning_ja": "仲裁する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1814,
      "word": "erode",
      "meaning_ja": "侵食する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1815,
      "word": "exterminate",
      "meaning_ja": "駆除する；絶滅させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1816,
      "word": "cajole",
      "meaning_ja": "甘言で説得する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1817,
      "word": "bulge",
      "meaning_ja": "膨らむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1818,
      "word": "fetter",
      "meaning_ja": "足かせ；束縛する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1819,
      "word": "engulf",
      "meaning_ja": "飲み込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1820,
      "word": "integrate",
      "meaning_ja": "統合する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1821,
      "word": "endow",
      "meaning_ja": "授ける；寄付する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1822,
      "word": "writhe",
      "meaning_ja": "身をよじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1823,
      "word": "belie",
      "meaning_ja": "誤りを示す；実態を隠す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1824,
      "word": "eavesdrop",
      "meaning_ja": "盗み聞きする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1825,
      "word": "ignite",
      "meaning_ja": "点火する；引き起こす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1826,
      "word": "impel",
      "meaning_ja": "駆り立てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1827,
      "word": "ferment",
      "meaning_ja": "発酵する；混乱",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1828,
      "word": "exalt",
      "meaning_ja": "称揚する；高める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1829,
      "word": "stow",
      "meaning_ja": "しまい込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1830,
      "word": "abhor",
      "meaning_ja": "忌み嫌う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1831,
      "word": "wield",
      "meaning_ja": "権力を行使する；道具を使う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1832,
      "word": "recede",
      "meaning_ja": "後退する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1833,
      "word": "intrigue",
      "meaning_ja": "興味をそそる；陰謀",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1834,
      "word": "sneer",
      "meaning_ja": "冷笑する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1835,
      "word": "caveat",
      "meaning_ja": "注意事項；但し書き",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1836,
      "word": "outlay",
      "meaning_ja": "支出",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1837,
      "word": "fertility",
      "meaning_ja": "繁殖力；肥沃さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1838,
      "word": "serenity",
      "meaning_ja": "平静",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1839,
      "word": "relic",
      "meaning_ja": "遺物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1840,
      "word": "scapegoat",
      "meaning_ja": "スケープゴート；身代わり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1841,
      "word": "plea",
      "meaning_ja": "懇願；抗弁",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1842,
      "word": "artillery",
      "meaning_ja": "大砲；砲兵",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1843,
      "word": "uprising",
      "meaning_ja": "蜂起",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1844,
      "word": "entity",
      "meaning_ja": "実体；組織",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1845,
      "word": "guise",
      "meaning_ja": "外観；見せかけ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1846,
      "word": "limb",
      "meaning_ja": "手足；大枝",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1847,
      "word": "compliance",
      "meaning_ja": "遵守",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1848,
      "word": "influx",
      "meaning_ja": "流入",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1849,
      "word": "tantrum",
      "meaning_ja": "かんしゃく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1850,
      "word": "harbinger",
      "meaning_ja": "前触れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1851,
      "word": "avarice",
      "meaning_ja": "強欲",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1852,
      "word": "ailment",
      "meaning_ja": "軽い病気",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1853,
      "word": "contraband",
      "meaning_ja": "密輸品；禁制品",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1854,
      "word": "surveillance",
      "meaning_ja": "監視",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1855,
      "word": "lineage",
      "meaning_ja": "血統",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1856,
      "word": "semblance",
      "meaning_ja": "外見；見せかけ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1857,
      "word": "anonymity",
      "meaning_ja": "匿名性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1858,
      "word": "gimmick",
      "meaning_ja": "人目を引く仕掛け",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1859,
      "word": "paragon",
      "meaning_ja": "模範",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1860,
      "word": "demeanor",
      "meaning_ja": "振る舞い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1861,
      "word": "apathy",
      "meaning_ja": "無関心",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1862,
      "word": "discrepancy",
      "meaning_ja": "不一致",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1863,
      "word": "anecdote",
      "meaning_ja": "逸話",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1864,
      "word": "jurisdiction",
      "meaning_ja": "管轄権",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1865,
      "word": "loophole",
      "meaning_ja": "抜け穴",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1866,
      "word": "malady",
      "meaning_ja": "病気；社会の弊害",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1867,
      "word": "bounty",
      "meaning_ja": "報奨金；豊富な恵み",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1868,
      "word": "beneficiary",
      "meaning_ja": "受益者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1869,
      "word": "abolition",
      "meaning_ja": "廃止",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1870,
      "word": "chivalry",
      "meaning_ja": "騎士道；礼儀正しさ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1871,
      "word": "provocative",
      "meaning_ja": "挑発的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1872,
      "word": "affluent",
      "meaning_ja": "裕福な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1873,
      "word": "categorical",
      "meaning_ja": "断定的な；明確な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1874,
      "word": "homogeneous",
      "meaning_ja": "均質な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1875,
      "word": "divine",
      "meaning_ja": "神の；推測する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1876,
      "word": "lenient",
      "meaning_ja": "寛大な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1877,
      "word": "anemic",
      "meaning_ja": "貧血の；活力のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1878,
      "word": "gaudy",
      "meaning_ja": "けばけばしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1879,
      "word": "succulent",
      "meaning_ja": "多汁でおいしい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1880,
      "word": "obsequious",
      "meaning_ja": "こびへつらう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1881,
      "word": "submissive",
      "meaning_ja": "従順な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1882,
      "word": "urbane",
      "meaning_ja": "洗練された",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1883,
      "word": "bleak",
      "meaning_ja": "荒涼とした；見通しの暗い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1884,
      "word": "insidious",
      "meaning_ja": "知らぬ間に害を及ぼす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1885,
      "word": "malignant",
      "meaning_ja": "悪性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1886,
      "word": "elastic",
      "meaning_ja": "弾力のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1887,
      "word": "prone",
      "meaning_ja": "しがちな；うつぶせの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1888,
      "word": "inclement",
      "meaning_ja": "天候が荒れた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1889,
      "word": "consummate",
      "meaning_ja": "完璧な；完了させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1890,
      "word": "shrewd",
      "meaning_ja": "抜け目のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1891,
      "word": "carnivorous",
      "meaning_ja": "肉食の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1892,
      "word": "intricate",
      "meaning_ja": "複雑な；精巧な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1893,
      "word": "lax",
      "meaning_ja": "緩い；怠慢な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1894,
      "word": "futile",
      "meaning_ja": "無益な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1895,
      "word": "ambiguous",
      "meaning_ja": "曖昧な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1896,
      "word": "charred",
      "meaning_ja": "黒焦げの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1897,
      "word": "manifest",
      "meaning_ja": "明白な；表す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1898,
      "word": "vigorous",
      "meaning_ja": "精力的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1899,
      "word": "bluntly",
      "meaning_ja": "率直に；ぶっきらぼうに",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1900,
      "word": "concur",
      "meaning_ja": "同意する；同時に起こる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1901,
      "word": "chafe",
      "meaning_ja": "こすれて痛む；いら立つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1902,
      "word": "materialize",
      "meaning_ja": "実現する；現れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1903,
      "word": "loom",
      "meaning_ja": "不気味に迫る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1904,
      "word": "crunch",
      "meaning_ja": "かみ砕く；数値を処理する；危機",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1905,
      "word": "prescribe",
      "meaning_ja": "処方する；規定する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1906,
      "word": "unleash",
      "meaning_ja": "解き放つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1907,
      "word": "heed",
      "meaning_ja": "注意を払う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1908,
      "word": "emigrate",
      "meaning_ja": "国外へ移住する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1909,
      "word": "stray",
      "meaning_ja": "迷う；はぐれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1910,
      "word": "discard",
      "meaning_ja": "捨てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1911,
      "word": "rhyme",
      "meaning_ja": "韻；韻を踏む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1912,
      "word": "quip",
      "meaning_ja": "気の利いた冗談を言う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1913,
      "word": "bully",
      "meaning_ja": "いじめる；いじめっ子",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1914,
      "word": "elongate",
      "meaning_ja": "長くする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1915,
      "word": "snatch",
      "meaning_ja": "ひったくる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1916,
      "word": "obstruct",
      "meaning_ja": "妨げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1917,
      "word": "erupt",
      "meaning_ja": "噴火する；勃発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1918,
      "word": "chronicle",
      "meaning_ja": "年代記；記録する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1919,
      "word": "consolidate",
      "meaning_ja": "統合する；強化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1920,
      "word": "reap",
      "meaning_ja": "刈り取る；利益を得る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1921,
      "word": "penalize",
      "meaning_ja": "罰する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1922,
      "word": "loot",
      "meaning_ja": "略奪する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1923,
      "word": "animate",
      "meaning_ja": "活気付ける；動きを与える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1924,
      "word": "beset",
      "meaning_ja": "苦しめる；取り囲む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1925,
      "word": "sprawl",
      "meaning_ja": "広がる；手足を伸ばす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1926,
      "word": "assimilate",
      "meaning_ja": "同化する；吸収する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1927,
      "word": "agitate",
      "meaning_ja": "動揺させる；扇動する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1928,
      "word": "dismay",
      "meaning_ja": "落胆；狼狽させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1929,
      "word": "cling",
      "meaning_ja": "しがみつく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1930,
      "word": "surpass",
      "meaning_ja": "上回る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1931,
      "word": "deplete",
      "meaning_ja": "使い果たす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1932,
      "word": "default",
      "meaning_ja": "債務不履行；初期設定",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1933,
      "word": "metabolize",
      "meaning_ja": "代謝する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1934,
      "word": "pendulum",
      "meaning_ja": "振り子",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1935,
      "word": "burial",
      "meaning_ja": "埋葬",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1936,
      "word": "stronghold",
      "meaning_ja": "とりで；本拠地",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1937,
      "word": "pawn",
      "meaning_ja": "手先；質に入れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1938,
      "word": "logistics",
      "meaning_ja": "物流；実行の段取り",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1939,
      "word": "milestone",
      "meaning_ja": "画期的な出来事",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1940,
      "word": "paranoia",
      "meaning_ja": "妄想症；強い被害意識",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1941,
      "word": "ration",
      "meaning_ja": "配給；配給する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1942,
      "word": "bribery",
      "meaning_ja": "贈収賄",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1943,
      "word": "subsistence",
      "meaning_ja": "生存；最低限の生活",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1944,
      "word": "heritage",
      "meaning_ja": "遺産",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1945,
      "word": "defect",
      "meaning_ja": "欠陥；離反する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1946,
      "word": "vacancy",
      "meaning_ja": "空き；欠員",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1947,
      "word": "standstill",
      "meaning_ja": "停止状態",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1948,
      "word": "constituent",
      "meaning_ja": "構成要素；有権者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1949,
      "word": "discord",
      "meaning_ja": "不和",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1950,
      "word": "academia",
      "meaning_ja": "学界",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1951,
      "word": "reptile",
      "meaning_ja": "爬虫類",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1952,
      "word": "brink",
      "meaning_ja": "瀬戸際",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1953,
      "word": "pollutant",
      "meaning_ja": "汚染物質",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1954,
      "word": "tariff",
      "meaning_ja": "関税",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1955,
      "word": "verge",
      "meaning_ja": "瀬戸際；境界",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1956,
      "word": "footage",
      "meaning_ja": "映像",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1957,
      "word": "recourse",
      "meaning_ja": "頼る手段",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1958,
      "word": "fabric",
      "meaning_ja": "織物；構造",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1959,
      "word": "cunning",
      "meaning_ja": "ずる賢さ；巧妙な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1960,
      "word": "electrode",
      "meaning_ja": "電極",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1961,
      "word": "dice",
      "meaning_ja": "サイコロ；さいの目に切る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1962,
      "word": "durability",
      "meaning_ja": "耐久性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1963,
      "word": "amphibian",
      "meaning_ja": "両生類",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1964,
      "word": "clutter",
      "meaning_ja": "散らかった物；散らかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1965,
      "word": "blast",
      "meaning_ja": "爆発；突風",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1966,
      "word": "coffer",
      "meaning_ja": "金庫；資金",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1967,
      "word": "hubris",
      "meaning_ja": "傲慢",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1968,
      "word": "arrogance",
      "meaning_ja": "横柄さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1969,
      "word": "laureate",
      "meaning_ja": "受賞者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1970,
      "word": "transparency",
      "meaning_ja": "透明性",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1971,
      "word": "hemisphere",
      "meaning_ja": "半球",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1972,
      "word": "watershed",
      "meaning_ja": "分水嶺；転機",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1973,
      "word": "supervision",
      "meaning_ja": "監督",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1974,
      "word": "adolescent",
      "meaning_ja": "思春期の；若者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1975,
      "word": "naive",
      "meaning_ja": "世間知らずの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1976,
      "word": "hefty",
      "meaning_ja": "重い；多額の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1977,
      "word": "minuscule",
      "meaning_ja": "非常に小さい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1978,
      "word": "synonymous",
      "meaning_ja": "同義の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1979,
      "word": "reputable",
      "meaning_ja": "評判のよい",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1980,
      "word": "authoritative",
      "meaning_ja": "権威のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1981,
      "word": "cardiovascular",
      "meaning_ja": "心臓血管の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1982,
      "word": "impaired",
      "meaning_ja": "機能が損なわれた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1983,
      "word": "porous",
      "meaning_ja": "多孔性の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1984,
      "word": "ingrained",
      "meaning_ja": "深く染み付いた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1985,
      "word": "inhumane",
      "meaning_ja": "非人道的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1986,
      "word": "wary",
      "meaning_ja": "用心深い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1987,
      "word": "juvenile",
      "meaning_ja": "少年の；幼稚な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1988,
      "word": "illiterate",
      "meaning_ja": "読み書きのできない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1989,
      "word": "superficial",
      "meaning_ja": "表面的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1990,
      "word": "insane",
      "meaning_ja": "正気でない；非常識な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1991,
      "word": "municipal",
      "meaning_ja": "市の；自治体の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1992,
      "word": "empirical",
      "meaning_ja": "経験的な；実証的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1993,
      "word": "sinister",
      "meaning_ja": "不吉な；邪悪な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1994,
      "word": "upscale",
      "meaning_ja": "高級な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1995,
      "word": "intimate",
      "meaning_ja": "親密な；ほのめかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1996,
      "word": "unconventional",
      "meaning_ja": "型にはまらない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1997,
      "word": "egalitarian",
      "meaning_ja": "平等主義の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1998,
      "word": "extravagant",
      "meaning_ja": "浪費的な；過度の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 1999,
      "word": "invaluable",
      "meaning_ja": "非常に貴重な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2000,
      "word": "strut",
      "meaning_ja": "気取って歩く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2001,
      "word": "stun",
      "meaning_ja": "気絶させる；驚かせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2002,
      "word": "fabricate",
      "meaning_ja": "でっち上げる；製造する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2003,
      "word": "spawn",
      "meaning_ja": "生み出す；産卵する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2004,
      "word": "endorse",
      "meaning_ja": "支持する；裏書きする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2005,
      "word": "infuriate",
      "meaning_ja": "激怒させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2006,
      "word": "contemplate",
      "meaning_ja": "熟考する；じっと見る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2007,
      "word": "linger",
      "meaning_ja": "長居する；残り続ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2008,
      "word": "mediate",
      "meaning_ja": "仲裁する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2009,
      "word": "reconcile",
      "meaning_ja": "和解させる；両立させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2010,
      "word": "applaud",
      "meaning_ja": "拍手する；称賛する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2011,
      "word": "efface",
      "meaning_ja": "消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2012,
      "word": "conflate",
      "meaning_ja": "混同する；融合する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2013,
      "word": "pit",
      "meaning_ja": "対抗させる；穴",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2014,
      "word": "reclaim",
      "meaning_ja": "取り戻す；埋め立てる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2015,
      "word": "precipitate",
      "meaning_ja": "引き起こす；沈殿する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2016,
      "word": "envisage",
      "meaning_ja": "思い描く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2017,
      "word": "shroud",
      "meaning_ja": "覆い隠す；覆い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2018,
      "word": "abstain",
      "meaning_ja": "控える；棄権する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2019,
      "word": "reimburse",
      "meaning_ja": "払い戻す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2020,
      "word": "expire",
      "meaning_ja": "期限が切れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2021,
      "word": "subside",
      "meaning_ja": "静まる；沈下する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2022,
      "word": "interrogate",
      "meaning_ja": "尋問する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2023,
      "word": "flunk",
      "meaning_ja": "試験に落ちる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2024,
      "word": "recoil",
      "meaning_ja": "後ずさりする；反動で動く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2025,
      "word": "commemorate",
      "meaning_ja": "記念する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2026,
      "word": "dissolution",
      "meaning_ja": "解散；溶解",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2027,
      "word": "portent",
      "meaning_ja": "前兆",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2028,
      "word": "paralysis",
      "meaning_ja": "麻痺",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2029,
      "word": "arsenal",
      "meaning_ja": "兵器庫；蓄え",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2030,
      "word": "backdrop",
      "meaning_ja": "背景",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2031,
      "word": "perimeter",
      "meaning_ja": "周囲；周辺の長さ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2032,
      "word": "ordeal",
      "meaning_ja": "厳しい試練",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2033,
      "word": "peril",
      "meaning_ja": "危険",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2034,
      "word": "diameter",
      "meaning_ja": "直径",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2035,
      "word": "discharge",
      "meaning_ja": "放出する；退院させる；解雇する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2036,
      "word": "amenity",
      "meaning_ja": "快適な設備",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2037,
      "word": "naturalization",
      "meaning_ja": "帰化",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2038,
      "word": "artery",
      "meaning_ja": "動脈；主要幹線",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2039,
      "word": "overture",
      "meaning_ja": "序曲；打診",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2040,
      "word": "mishap",
      "meaning_ja": "不運な事故",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2041,
      "word": "diffusion",
      "meaning_ja": "拡散",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2042,
      "word": "intake",
      "meaning_ja": "摂取量；取り入れ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2043,
      "word": "freight",
      "meaning_ja": "貨物；運賃",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2044,
      "word": "sanctuary",
      "meaning_ja": "聖域；保護区",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2045,
      "word": "bureaucracy",
      "meaning_ja": "官僚制度",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2046,
      "word": "compassion",
      "meaning_ja": "思いやり",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2047,
      "word": "anatomy",
      "meaning_ja": "解剖学；身体の構造",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2048,
      "word": "fraternity",
      "meaning_ja": "友愛；学生の親睦団体",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2049,
      "word": "tumor",
      "meaning_ja": "腫瘍",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2050,
      "word": "dictator",
      "meaning_ja": "独裁者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2051,
      "word": "outcast",
      "meaning_ja": "のけ者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2052,
      "word": "adulation",
      "meaning_ja": "過度の称賛",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2053,
      "word": "bliss",
      "meaning_ja": "至福",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2054,
      "word": "deprivation",
      "meaning_ja": "剥奪；欠乏",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2055,
      "word": "cascade",
      "meaning_ja": "小さな滝；連続して起こるもの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2056,
      "word": "hysteria",
      "meaning_ja": "異常な興奮；集団的なパニック",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2057,
      "word": "patriot",
      "meaning_ja": "愛国者",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2058,
      "word": "testimonial",
      "meaning_ja": "推薦状；証言",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2059,
      "word": "tier",
      "meaning_ja": "段；階層",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2060,
      "word": "conformity",
      "meaning_ja": "順応；適合",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2061,
      "word": "tribute",
      "meaning_ja": "賛辞；貢ぎ物",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2062,
      "word": "decency",
      "meaning_ja": "礼儀正しさ；良識",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2063,
      "word": "apprehension",
      "meaning_ja": "不安；逮捕；理解",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2064,
      "word": "dismal",
      "meaning_ja": "陰鬱な；惨めな",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2065,
      "word": "lunar",
      "meaning_ja": "月の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2066,
      "word": "simultaneous",
      "meaning_ja": "同時の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2067,
      "word": "redundant",
      "meaning_ja": "余分な；人員整理で不要な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2068,
      "word": "idiosyncratic",
      "meaning_ja": "独特の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2069,
      "word": "overdue",
      "meaning_ja": "期限を過ぎた",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2070,
      "word": "hospitable",
      "meaning_ja": "親切にもてなす；住むのに適した",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2071,
      "word": "stern",
      "meaning_ja": "厳格な；船尾",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2072,
      "word": "airborne",
      "meaning_ja": "空気で運ばれる；飛行中の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2073,
      "word": "conceivable",
      "meaning_ja": "考えられる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2074,
      "word": "punitive",
      "meaning_ja": "懲罰的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2075,
      "word": "respiratory",
      "meaning_ja": "呼吸の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2076,
      "word": "spacious",
      "meaning_ja": "広々とした",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2077,
      "word": "sterile",
      "meaning_ja": "無菌の；不毛な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2078,
      "word": "amicable",
      "meaning_ja": "友好的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2079,
      "word": "addictive",
      "meaning_ja": "依存性のある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2080,
      "word": "disposable",
      "meaning_ja": "使い捨ての；処分可能な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2081,
      "word": "filthy",
      "meaning_ja": "不潔な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2082,
      "word": "sheer",
      "meaning_ja": "まったくの；切り立った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2083,
      "word": "confidential",
      "meaning_ja": "機密の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2084,
      "word": "edible",
      "meaning_ja": "食べられる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2085,
      "word": "despicable",
      "meaning_ja": "卑劣な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2086,
      "word": "predominant",
      "meaning_ja": "支配的な；最も多い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2087,
      "word": "pretentious",
      "meaning_ja": "気取った",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2088,
      "word": "static",
      "meaning_ja": "静止した；変化のない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2089,
      "word": "discreet",
      "meaning_ja": "慎重な；口の堅い",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2090,
      "word": "impregnable",
      "meaning_ja": "難攻不落の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2091,
      "word": "obligatory",
      "meaning_ja": "義務的な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2092,
      "word": "ominous",
      "meaning_ja": "不吉な",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2093,
      "word": "torrential",
      "meaning_ja": "土砂降りの",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2094,
      "word": "ailing",
      "meaning_ja": "病気の；不振の",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2095,
      "word": "squarely",
      "meaning_ja": "正面から；真っ向から",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2096,
      "word": "indefinitely",
      "meaning_ja": "無期限に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2097,
      "word": "figuratively",
      "meaning_ja": "比喩的に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2098,
      "word": "belatedly",
      "meaning_ja": "遅れて",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2099,
      "word": "incidentally",
      "meaning_ja": "ちなみに；偶然に",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2100,
      "word": "crack down on",
      "meaning_ja": "厳しく取り締まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2101,
      "word": "boil down to",
      "meaning_ja": "結局～ということになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2102,
      "word": "reinin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2103,
      "word": "vouch for",
      "meaning_ja": "保証する；正しいと証言する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2104,
      "word": "beef up",
      "meaning_ja": "強化する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2105,
      "word": "dispense with",
      "meaning_ja": "なしで済ませる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2106,
      "word": "hinge on",
      "meaning_ja": "～次第である",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2107,
      "word": "weighin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2108,
      "word": "actup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2109,
      "word": "bail out",
      "meaning_ja": "救済する；保釈する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2110,
      "word": "head off",
      "meaning_ja": "阻止する；先回りする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2111,
      "word": "fend for oneself",
      "meaning_ja": "自活する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2112,
      "word": "kickin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2113,
      "word": "pull off",
      "meaning_ja": "困難なことをやってのける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2114,
      "word": "wind up",
      "meaning_ja": "結局～になる；終える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2115,
      "word": "weed out",
      "meaning_ja": "取り除く；淘汰する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2116,
      "word": "rollout",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2117,
      "word": "cashinon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2118,
      "word": "pitchin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2119,
      "word": "bear out",
      "meaning_ja": "裏付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2120,
      "word": "zeroinon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2121,
      "word": "factor in",
      "meaning_ja": "要因として考慮する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2122,
      "word": "take off",
      "meaning_ja": "離陸する；急に成功する；脱ぐ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2123,
      "word": "iron out",
      "meaning_ja": "問題などを解消する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2124,
      "word": "churn out",
      "meaning_ja": "大量に作り出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2125,
      "word": "shrug off",
      "meaning_ja": "気にせずに受け流す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2126,
      "word": "level off",
      "meaning_ja": "横ばいになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2127,
      "word": "shy away from",
      "meaning_ja": "～を避ける；尻込みする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2128,
      "word": "side with a",
      "meaning_ja": "Aの味方をする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2129,
      "word": "stirup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2130,
      "word": "pass down",
      "meaning_ja": "後世に伝える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2131,
      "word": "getbackata",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2132,
      "word": "follow through",
      "meaning_ja": "最後までやり遂げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2133,
      "word": "ward off",
      "meaning_ja": "防ぐ；かわす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2134,
      "word": "dive into",
      "meaning_ja": "飛び込む；熱心に取り組む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2135,
      "word": "lag behind",
      "meaning_ja": "遅れを取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2136,
      "word": "hold a",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2137,
      "word": "turnto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2138,
      "word": "wipe out",
      "meaning_ja": "一掃する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2139,
      "word": "tear down",
      "meaning_ja": "取り壊す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2140,
      "word": "stick around",
      "meaning_ja": "近くにとどまる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2141,
      "word": "wear off",
      "meaning_ja": "効果が薄れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2142,
      "word": "abide by",
      "meaning_ja": "規則などを守る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2143,
      "word": "attribute a tob",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2144,
      "word": "draga into b",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2145,
      "word": "tapinto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2146,
      "word": "mull over",
      "meaning_ja": "じっくり考える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2147,
      "word": "buckle down",
      "meaning_ja": "本腰を入れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2148,
      "word": "live down",
      "meaning_ja": "失敗などを忘れてもらう",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2149,
      "word": "crop up",
      "meaning_ja": "突然現れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2150,
      "word": "shell out",
      "meaning_ja": "大金をしぶしぶ払う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2151,
      "word": "drift off",
      "meaning_ja": "眠り込む；漂って離れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2152,
      "word": "bow out",
      "meaning_ja": "身を引く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2153,
      "word": "rifle through",
      "meaning_ja": "くまなく探す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2154,
      "word": "tip off",
      "meaning_ja": "情報をそっと教える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2155,
      "word": "fend off",
      "meaning_ja": "撃退する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2156,
      "word": "dawnona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2157,
      "word": "putin for",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2158,
      "word": "doteona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2159,
      "word": "tamper with",
      "meaning_ja": "勝手にいじる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2160,
      "word": "bankon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2161,
      "word": "drown out",
      "meaning_ja": "音をかき消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2162,
      "word": "eggon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2163,
      "word": "blow away",
      "meaning_ja": "吹き飛ばす；圧倒する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2164,
      "word": "ruboffona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2165,
      "word": "scrape by",
      "meaning_ja": "どうにか生活する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2166,
      "word": "goata",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2167,
      "word": "hail from",
      "meaning_ja": "～の出身である",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2168,
      "word": "buttin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2169,
      "word": "butter up",
      "meaning_ja": "おだてる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2170,
      "word": "doup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2171,
      "word": "level with a",
      "meaning_ja": "Aに率直に話す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2172,
      "word": "clamup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2173,
      "word": "pine for",
      "meaning_ja": "恋しく思う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2174,
      "word": "panout",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2175,
      "word": "lash out",
      "meaning_ja": "激しく非難する；殴りかかる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2176,
      "word": "palm off",
      "meaning_ja": "厄介なものを押し付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2177,
      "word": "smooth over",
      "meaning_ja": "問題を穏便に収める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2178,
      "word": "chime in",
      "meaning_ja": "話に加わる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2179,
      "word": "harpon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2180,
      "word": "whip up",
      "meaning_ja": "急いで作る；感情を煽る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2181,
      "word": "peter out",
      "meaning_ja": "次第に消える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2182,
      "word": "reel off",
      "meaning_ja": "すらすら述べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2183,
      "word": "eke out",
      "meaning_ja": "何とか生計を立てる；補う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2184,
      "word": "rattle off",
      "meaning_ja": "すらすら列挙する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2185,
      "word": "chip away at",
      "meaning_ja": "少しずつ削る；弱める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2186,
      "word": "wriggle out of",
      "meaning_ja": "巧みに逃れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2187,
      "word": "make off with",
      "meaning_ja": "持ち逃げする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2188,
      "word": "fire away",
      "meaning_ja": "遠慮なく質問する；撃ち始める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2189,
      "word": "bear down on",
      "meaning_ja": "～に迫る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2190,
      "word": "breeze in",
      "meaning_ja": "気軽に入ってくる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2191,
      "word": "fanout",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2192,
      "word": "cast off",
      "meaning_ja": "捨て去る；綱を解いて出発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2193,
      "word": "polish off",
      "meaning_ja": "平らげる；さっさと片付ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2194,
      "word": "scoot over",
      "meaning_ja": "席を詰める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2195,
      "word": "ownupto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2196,
      "word": "shake off",
      "meaning_ja": "振り払う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2197,
      "word": "fizzle out",
      "meaning_ja": "尻すぼみに終わる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2198,
      "word": "patch up",
      "meaning_ja": "修復する；仲直りする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2199,
      "word": "descend on",
      "meaning_ja": "押しかける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2200,
      "word": "sound off",
      "meaning_ja": "大声で意見を述べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2201,
      "word": "leap out at a",
      "meaning_ja": "Aの目に飛び込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2202,
      "word": "fall through",
      "meaning_ja": "計画などが駄目になる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2203,
      "word": "gangupona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2204,
      "word": "bowl over",
      "meaning_ja": "驚かせる；なぎ倒す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2205,
      "word": "copout",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2206,
      "word": "trail off",
      "meaning_ja": "声などが次第に消える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2207,
      "word": "hold out for",
      "meaning_ja": "条件を譲らず待つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2208,
      "word": "rip off",
      "meaning_ja": "だまし取る；法外な料金を取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2209,
      "word": "farm out",
      "meaning_ja": "外注する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2210,
      "word": "be bogged down",
      "meaning_ja": "行き詰まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2211,
      "word": "fritter away",
      "meaning_ja": "浪費する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2212,
      "word": "goof off",
      "meaning_ja": "怠ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2213,
      "word": "dwellon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2214,
      "word": "poke around",
      "meaning_ja": "あちこち探る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2215,
      "word": "pick off",
      "meaning_ja": "一人ずつ狙い撃ちする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2216,
      "word": "smack of",
      "meaning_ja": "～の気味がある",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2217,
      "word": "settle on",
      "meaning_ja": "決める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2218,
      "word": "sound out",
      "meaning_ja": "意向を探る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2219,
      "word": "boil over",
      "meaning_ja": "沸騰してあふれる；感情が爆発する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2220,
      "word": "dish out",
      "meaning_ja": "料理を盛る；与える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2221,
      "word": "crank out",
      "meaning_ja": "大量に作る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2222,
      "word": "simmer down",
      "meaning_ja": "落ち着く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2223,
      "word": "taper off",
      "meaning_ja": "次第に減る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2224,
      "word": "piece together",
      "meaning_ja": "つなぎ合わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2225,
      "word": "rail against",
      "meaning_ja": "激しく非難する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2226,
      "word": "snap out of",
      "meaning_ja": "気分などから立ち直る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2227,
      "word": "jockey for",
      "meaning_ja": "～を得ようと競う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2228,
      "word": "louse up",
      "meaning_ja": "台無しにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2229,
      "word": "blot out",
      "meaning_ja": "覆い隠す；記憶を消す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2230,
      "word": "hunker down",
      "meaning_ja": "身をかがめる；腰を据える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2231,
      "word": "swear by",
      "meaning_ja": "絶大な信頼を寄せる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2232,
      "word": "carveup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2233,
      "word": "chew out",
      "meaning_ja": "厳しく叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2234,
      "word": "be decked out",
      "meaning_ja": "着飾っている；飾り付けられている",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2235,
      "word": "dole out",
      "meaning_ja": "少しずつ分配する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2236,
      "word": "snap up",
      "meaning_ja": "すぐに買う；機会をつかむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2237,
      "word": "wolf down",
      "meaning_ja": "がつがつ食べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2238,
      "word": "write off",
      "meaning_ja": "見限る；帳消しにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2239,
      "word": "bawl out",
      "meaning_ja": "大声で叱る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2240,
      "word": "bottle up",
      "meaning_ja": "感情を抑え込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2241,
      "word": "barge through",
      "meaning_ja": "強引に押し通る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2242,
      "word": "fork out",
      "meaning_ja": "しぶしぶ支払う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2243,
      "word": "runup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2244,
      "word": "levela atb",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2245,
      "word": "diginto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2246,
      "word": "come infor",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2247,
      "word": "coast along",
      "meaning_ja": "楽にやっていく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2248,
      "word": "wind down",
      "meaning_ja": "徐々に終える；くつろぐ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2249,
      "word": "frownon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2250,
      "word": "kick around",
      "meaning_ja": "案を検討する；ぶらぶら過ごす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2251,
      "word": "rollin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2252,
      "word": "easeup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2253,
      "word": "ride out",
      "meaning_ja": "嵐や困難を乗り切る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2254,
      "word": "choke off",
      "meaning_ja": "阻止する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2255,
      "word": "pilein",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2256,
      "word": "strike on",
      "meaning_ja": "思い付く；見つける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2257,
      "word": "tide over",
      "meaning_ja": "困難な時期をしのがせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2258,
      "word": "bargain for",
      "meaning_ja": "予期する；当てにする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2259,
      "word": "beput upon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2260,
      "word": "nose around",
      "meaning_ja": "かぎ回る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2261,
      "word": "put across",
      "meaning_ja": "考えを伝える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2262,
      "word": "play along",
      "meaning_ja": "調子を合わせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2263,
      "word": "limber up",
      "meaning_ja": "準備運動をする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2264,
      "word": "wash over a",
      "meaning_ja": "感情などがAを襲う；Aに影響を与えず通り過ぎる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2265,
      "word": "dip into",
      "meaning_ja": "少し使う；拾い読みする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2266,
      "word": "bekeyed up",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2267,
      "word": "buy off",
      "meaning_ja": "買収する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2268,
      "word": "settle up",
      "meaning_ja": "勘定を清算する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2269,
      "word": "growona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2270,
      "word": "root out",
      "meaning_ja": "根絶する；探し出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2271,
      "word": "squeak by",
      "meaning_ja": "ぎりぎりで切り抜ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2272,
      "word": "come around",
      "meaning_ja": "意見を変える；意識を取り戻す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2273,
      "word": "flesh out",
      "meaning_ja": "具体的な内容を加える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2274,
      "word": "ropea intob",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2275,
      "word": "fallin with a",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2276,
      "word": "comedownona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2277,
      "word": "throw out",
      "meaning_ja": "捨てる；却下する；追い出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2278,
      "word": "horse around",
      "meaning_ja": "ばか騒ぎする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2279,
      "word": "leton",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2280,
      "word": "rack up",
      "meaning_ja": "得点などを積み上げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2281,
      "word": "stumble upon",
      "meaning_ja": "偶然見つける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2282,
      "word": "mill about",
      "meaning_ja": "当てもなくうろつく",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2283,
      "word": "rip through",
      "meaning_ja": "すごい勢いで通過する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2284,
      "word": "pin down",
      "meaning_ja": "正確に突き止める；動けなくする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2285,
      "word": "stamp out",
      "meaning_ja": "根絶する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2286,
      "word": "rally around a",
      "meaning_ja": "Aを一致して支援する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2287,
      "word": "playup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2288,
      "word": "rustle up",
      "meaning_ja": "急いで用意する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2289,
      "word": "leanona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2290,
      "word": "muscle inon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2291,
      "word": "toy withh",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2292,
      "word": "haul off",
      "meaning_ja": "引きずって連れ去る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2293,
      "word": "passoffa asb",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2294,
      "word": "pluckup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2295,
      "word": "hold down",
      "meaning_ja": "仕事を維持する；抑える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2296,
      "word": "kick up",
      "meaning_ja": "騒ぎを起こす；強まる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2297,
      "word": "stake out",
      "meaning_ja": "張り込む；権利を主張する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2298,
      "word": "hemin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2299,
      "word": "nail down",
      "meaning_ja": "確定する；正確に把握する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2300,
      "word": "knuckle down",
      "meaning_ja": "本腰を入れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2301,
      "word": "tear into",
      "meaning_ja": "激しく攻撃する；夢中で取りかかる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2302,
      "word": "trump up",
      "meaning_ja": "でっち上げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2303,
      "word": "scrimpon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2304,
      "word": "nod off",
      "meaning_ja": "居眠りする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2305,
      "word": "flare up",
      "meaning_ja": "急に燃え上がる；再燃する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2306,
      "word": "crouch down",
      "meaning_ja": "身をかがめる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2307,
      "word": "while away",
      "meaning_ja": "のんびり時を過ごす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2308,
      "word": "crack up",
      "meaning_ja": "大笑いする；精神的に参る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2309,
      "word": "keel over",
      "meaning_ja": "突然倒れる；転覆する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2310,
      "word": "drumup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2311,
      "word": "chokeup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2312,
      "word": "cavein",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2313,
      "word": "blurt out",
      "meaning_ja": "うっかり口走る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2314,
      "word": "trip up",
      "meaning_ja": "つまずかせる；失敗させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2315,
      "word": "gloss over",
      "meaning_ja": "不都合なことをごまかす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2316,
      "word": "hole up",
      "meaning_ja": "隠れる；閉じこもる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2317,
      "word": "leaf through",
      "meaning_ja": "ぱらぱらめくる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2318,
      "word": "pore over",
      "meaning_ja": "熟読する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2319,
      "word": "snapata",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2320,
      "word": "rootfor a",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2321,
      "word": "scratch out",
      "meaning_ja": "苦労して書く；削り取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2322,
      "word": "suckuptoa",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2323,
      "word": "stockupon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2324,
      "word": "dash off",
      "meaning_ja": "急いで書く；急に出かける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2325,
      "word": "creepupona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2326,
      "word": "leadupto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2327,
      "word": "rake in",
      "meaning_ja": "大金を稼ぐ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2328,
      "word": "gloat over",
      "meaning_ja": "得意げに喜ぶ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2329,
      "word": "muddle through",
      "meaning_ja": "何とか切り抜ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2330,
      "word": "chipin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2331,
      "word": "prya outofb",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2332,
      "word": "swear in",
      "meaning_ja": "宣誓させて就任させる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2333,
      "word": "clogup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2334,
      "word": "skirt around",
      "meaning_ja": "問題に触れるのを避ける",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2335,
      "word": "pickupon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2336,
      "word": "ramp up",
      "meaning_ja": "増強する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2337,
      "word": "reelin",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2338,
      "word": "sift through",
      "meaning_ja": "丹念に調べる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2339,
      "word": "snuff out",
      "meaning_ja": "火を消す；命などを奪う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2340,
      "word": "mete out",
      "meaning_ja": "罰などを与える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2341,
      "word": "standinfor a",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2342,
      "word": "belt out",
      "meaning_ja": "大声で歌う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2343,
      "word": "waste away",
      "meaning_ja": "衰弱する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2344,
      "word": "dragon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2345,
      "word": "spruce up",
      "meaning_ja": "身なりや外観を整える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2346,
      "word": "square up",
      "meaning_ja": "借金を清算する；対決の構えを取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2347,
      "word": "strike up",
      "meaning_ja": "会話などを始める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2348,
      "word": "go through with",
      "meaning_ja": "計画を最後まで実行する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2349,
      "word": "foulup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2350,
      "word": "jot down",
      "meaning_ja": "書き留める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2351,
      "word": "roll back",
      "meaning_ja": "元に戻す；縮小する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2352,
      "word": "square off",
      "meaning_ja": "対決する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2353,
      "word": "play down",
      "meaning_ja": "重要性を低く見せる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2354,
      "word": "claw back",
      "meaning_ja": "取り戻す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2355,
      "word": "dabble in",
      "meaning_ja": "趣味程度に手を出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2356,
      "word": "back out",
      "meaning_ja": "約束などから手を引く",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2357,
      "word": "knuckle under",
      "meaning_ja": "屈服する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2358,
      "word": "choke back",
      "meaning_ja": "涙や感情をこらえる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2359,
      "word": "bridle at",
      "meaning_ja": "憤慨する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2360,
      "word": "mouth off",
      "meaning_ja": "生意気なことを言う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2361,
      "word": "chug along",
      "meaning_ja": "ゆっくり着実に進む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2362,
      "word": "boot out",
      "meaning_ja": "追い出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2363,
      "word": "plow through",
      "meaning_ja": "困難を押して進む；読み進める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2364,
      "word": "flick through",
      "meaning_ja": "ぱらぱらめくる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2365,
      "word": "front for",
      "meaning_ja": "隠れみのになる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2366,
      "word": "bottom out",
      "meaning_ja": "底を打つ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2367,
      "word": "wallow in",
      "meaning_ja": "感情などに浸る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2368,
      "word": "ratchet up",
      "meaning_ja": "徐々に引き上げる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2369,
      "word": "revel in",
      "meaning_ja": "大いに楽しむ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2370,
      "word": "tail off",
      "meaning_ja": "次第に減る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2371,
      "word": "wear down",
      "meaning_ja": "徐々に弱らせる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2372,
      "word": "gnawat",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2373,
      "word": "caterto",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2374,
      "word": "grateon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2375,
      "word": "head up",
      "meaning_ja": "率いる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2376,
      "word": "skim off",
      "meaning_ja": "上澄みを取る；利益をかすめ取る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2377,
      "word": "stave off",
      "meaning_ja": "防ぐ；食い止める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2378,
      "word": "pass for",
      "meaning_ja": "～と見なされる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2379,
      "word": "letupon",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2380,
      "word": "storm out of",
      "meaning_ja": "怒って飛び出す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2381,
      "word": "sitinfor a",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2382,
      "word": "whisk away",
      "meaning_ja": "さっと連れ去る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2383,
      "word": "spice up",
      "meaning_ja": "面白みを加える",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2384,
      "word": "zone out",
      "meaning_ja": "ぼんやりする",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2385,
      "word": "face off",
      "meaning_ja": "対決する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2386,
      "word": "stoop to",
      "meaning_ja": "卑劣なことに手を染める",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2387,
      "word": "interfere with",
      "meaning_ja": "妨げる；干渉する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2388,
      "word": "strike down",
      "meaning_ja": "無効にする；倒す",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2389,
      "word": "spring up",
      "meaning_ja": "突然現れる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2390,
      "word": "pass up",
      "meaning_ja": "機会を見送る",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2391,
      "word": "fall flat",
      "meaning_ja": "失敗する；受けない",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2392,
      "word": "wreak havoc on",
      "meaning_ja": "大混乱をもたらす",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2393,
      "word": "propup",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2394,
      "word": "takeitoutona",
      "meaning_ja": null,
      "meaning_source": "pending_spelling_review",
      "meaning_user_edited": false,
      "translation_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "id": 2395,
      "word": "opt out of",
      "meaning_ja": "参加しないことを選ぶ",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2396,
      "word": "defer to",
      "meaning_ja": "判断などを委ねる；従う",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2397,
      "word": "capitalize on",
      "meaning_ja": "有利に利用する",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2398,
      "word": "creep into",
      "meaning_ja": "徐々に入り込む",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    },
    {
      "id": 2399,
      "word": "brim over",
      "meaning_ja": "あふれる",
      "meaning_source": "assistant_study_gloss",
      "meaning_user_edited": false
    }
  ],
  "entries": [
    {
      "number": 1,
      "word_id": 1,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2,
      "word_id": 2,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 3,
      "word_id": 3,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 4,
      "word_id": 4,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 5,
      "word_id": 5,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 6,
      "word_id": 6,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 7,
      "word_id": 7,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 8,
      "word_id": 8,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 9,
      "word_id": 9,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 10,
      "word_id": 10,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 11,
      "word_id": 11,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 12,
      "word_id": 12,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 13,
      "word_id": 13,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 14,
      "word_id": 14,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 15,
      "word_id": 15,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 16,
      "word_id": 16,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 17,
      "word_id": 17,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 18,
      "word_id": 18,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 19,
      "word_id": 19,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 20,
      "word_id": 20,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 21,
      "word_id": 21,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 22,
      "word_id": 22,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 23,
      "word_id": 23,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 24,
      "word_id": 24,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 25,
      "word_id": 25,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 26,
      "word_id": 26,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 27,
      "word_id": 27,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 28,
      "word_id": 28,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 29,
      "word_id": 29,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 30,
      "word_id": 30,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 31,
      "word_id": 31,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 32,
      "word_id": 32,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 33,
      "word_id": 33,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 34,
      "word_id": 34,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 35,
      "word_id": 35,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 36,
      "word_id": 36,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 37,
      "word_id": 37,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 38,
      "word_id": 38,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 39,
      "word_id": 39,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 40,
      "word_id": 40,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 41,
      "word_id": 41,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 42,
      "word_id": 42,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 43,
      "word_id": 43,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 44,
      "word_id": 44,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 45,
      "word_id": 45,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 46,
      "word_id": 46,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 47,
      "word_id": 47,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 48,
      "word_id": 48,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 49,
      "word_id": 49,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 50,
      "word_id": 50,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 51,
      "word_id": 51,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 52,
      "word_id": 52,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 53,
      "word_id": 53,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 54,
      "word_id": 54,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 55,
      "word_id": 55,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 56,
      "word_id": 56,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 57,
      "word_id": 57,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 58,
      "word_id": 58,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 59,
      "word_id": 59,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 60,
      "word_id": 60,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 61,
      "word_id": 61,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 62,
      "word_id": 62,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 63,
      "word_id": 63,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 64,
      "word_id": 64,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 65,
      "word_id": 65,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 66,
      "word_id": 66,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 67,
      "word_id": 67,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 68,
      "word_id": 68,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 69,
      "word_id": 69,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 70,
      "word_id": 70,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 71,
      "word_id": 71,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 72,
      "word_id": 72,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 73,
      "word_id": 73,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 74,
      "word_id": 74,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 75,
      "word_id": 75,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 76,
      "word_id": 76,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 77,
      "word_id": 77,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 78,
      "word_id": 78,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 79,
      "word_id": 79,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 80,
      "word_id": 80,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 81,
      "word_id": 81,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 82,
      "word_id": 82,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 83,
      "word_id": 83,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 84,
      "word_id": 84,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 85,
      "word_id": 85,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 86,
      "word_id": 86,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 87,
      "word_id": 87,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 88,
      "word_id": 88,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 89,
      "word_id": 89,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 90,
      "word_id": 90,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 91,
      "word_id": 91,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 92,
      "word_id": 92,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 93,
      "word_id": 93,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 94,
      "word_id": 94,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 95,
      "word_id": 95,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 96,
      "word_id": 96,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 97,
      "word_id": 97,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 98,
      "word_id": 98,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 99,
      "word_id": 99,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 100,
      "word_id": 100,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 101,
      "word_id": 101,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 102,
      "word_id": 102,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 103,
      "word_id": 103,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 104,
      "word_id": 104,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 105,
      "word_id": 105,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 106,
      "word_id": 106,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 107,
      "word_id": 107,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 108,
      "word_id": 108,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 109,
      "word_id": 109,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 110,
      "word_id": 110,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 111,
      "word_id": 111,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 112,
      "word_id": 112,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 113,
      "word_id": 113,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 114,
      "word_id": 114,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 115,
      "word_id": 115,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 116,
      "word_id": 116,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 117,
      "word_id": 117,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 118,
      "word_id": 118,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 119,
      "word_id": 119,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 120,
      "word_id": 120,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 121,
      "word_id": 121,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 122,
      "word_id": 122,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 123,
      "word_id": 123,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 124,
      "word_id": 124,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 125,
      "word_id": 125,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 126,
      "word_id": 126,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 127,
      "word_id": 127,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 128,
      "word_id": 128,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 129,
      "word_id": 129,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 130,
      "word_id": 130,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 131,
      "word_id": 131,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 132,
      "word_id": 132,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 133,
      "word_id": 133,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 134,
      "word_id": 134,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 135,
      "word_id": 135,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 136,
      "word_id": 136,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 137,
      "word_id": 137,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 138,
      "word_id": 138,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 139,
      "word_id": 139,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 140,
      "word_id": 140,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 141,
      "word_id": 141,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 142,
      "word_id": 142,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 143,
      "word_id": 143,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 144,
      "word_id": 144,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 145,
      "word_id": 145,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 146,
      "word_id": 146,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 147,
      "word_id": 147,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 148,
      "word_id": 148,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 149,
      "word_id": 149,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 150,
      "word_id": 150,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 151,
      "word_id": 151,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 152,
      "word_id": 152,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 153,
      "word_id": 153,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 154,
      "word_id": 154,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 155,
      "word_id": 155,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 156,
      "word_id": 156,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 157,
      "word_id": 157,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 158,
      "word_id": 158,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 159,
      "word_id": 159,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 160,
      "word_id": 160,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 161,
      "word_id": 161,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 162,
      "word_id": 162,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 163,
      "word_id": 163,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 164,
      "word_id": 164,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 165,
      "word_id": 165,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 166,
      "word_id": 166,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 167,
      "word_id": 167,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 168,
      "word_id": 168,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 169,
      "word_id": 169,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 170,
      "word_id": 170,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 171,
      "word_id": 171,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 172,
      "word_id": 172,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 173,
      "word_id": 173,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 174,
      "word_id": 174,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 175,
      "word_id": 175,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 176,
      "word_id": 176,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 177,
      "word_id": 177,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 178,
      "word_id": 178,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 179,
      "word_id": 179,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 180,
      "word_id": 180,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 181,
      "word_id": 181,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 182,
      "word_id": 182,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 183,
      "word_id": 183,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 184,
      "word_id": 184,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 185,
      "word_id": 185,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 186,
      "word_id": 186,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 187,
      "word_id": 187,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 188,
      "word_id": 188,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 189,
      "word_id": 189,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 190,
      "word_id": 190,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 191,
      "word_id": 191,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 192,
      "word_id": 192,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 193,
      "word_id": 193,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 194,
      "word_id": 194,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 195,
      "word_id": 195,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 196,
      "word_id": 196,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 197,
      "word_id": 197,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 198,
      "word_id": 198,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 199,
      "word_id": 199,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 200,
      "word_id": 200,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 201,
      "word_id": 201,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 202,
      "word_id": 202,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 203,
      "word_id": 203,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 204,
      "word_id": 204,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 205,
      "word_id": 205,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 206,
      "word_id": 206,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 207,
      "word_id": 207,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 208,
      "word_id": 208,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 209,
      "word_id": 209,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 210,
      "word_id": 210,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 211,
      "word_id": 211,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 212,
      "word_id": 212,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 213,
      "word_id": 213,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 214,
      "word_id": 214,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 215,
      "word_id": 215,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 216,
      "word_id": 216,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 217,
      "word_id": 217,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 218,
      "word_id": 218,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 219,
      "word_id": 219,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 220,
      "word_id": 220,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 221,
      "word_id": 221,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 222,
      "word_id": 222,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 223,
      "word_id": 223,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 224,
      "word_id": 224,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 225,
      "word_id": 225,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 226,
      "word_id": 226,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 227,
      "word_id": 227,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 228,
      "word_id": 228,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 229,
      "word_id": 229,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 230,
      "word_id": 230,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 231,
      "word_id": 231,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 232,
      "word_id": 232,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 233,
      "word_id": 233,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 234,
      "word_id": 234,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 235,
      "word_id": 235,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 236,
      "word_id": 236,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 237,
      "word_id": 237,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 238,
      "word_id": 238,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 239,
      "word_id": 239,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 240,
      "word_id": 240,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 241,
      "word_id": 241,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 242,
      "word_id": 242,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 243,
      "word_id": 243,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 244,
      "word_id": 244,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 245,
      "word_id": 245,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 246,
      "word_id": 246,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 247,
      "word_id": 247,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 248,
      "word_id": 248,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 249,
      "word_id": 249,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 250,
      "word_id": 250,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 251,
      "word_id": 251,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 252,
      "word_id": 252,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 253,
      "word_id": 253,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 254,
      "word_id": 254,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 255,
      "word_id": 255,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 256,
      "word_id": 256,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 257,
      "word_id": 257,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 258,
      "word_id": 258,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 259,
      "word_id": 259,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 260,
      "word_id": 260,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 261,
      "word_id": 261,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 262,
      "word_id": 262,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 263,
      "word_id": 263,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 264,
      "word_id": 264,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 265,
      "word_id": 265,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 266,
      "word_id": 266,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 267,
      "word_id": 267,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 268,
      "word_id": 268,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 269,
      "word_id": 269,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 270,
      "word_id": 270,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 271,
      "word_id": 271,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 272,
      "word_id": 272,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 273,
      "word_id": 273,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 274,
      "word_id": 274,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 275,
      "word_id": 275,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 276,
      "word_id": 276,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 277,
      "word_id": 277,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 278,
      "word_id": 278,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 279,
      "word_id": 279,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 280,
      "word_id": 280,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 281,
      "word_id": 281,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 282,
      "word_id": 282,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 283,
      "word_id": 283,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 284,
      "word_id": 284,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 285,
      "word_id": 285,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 286,
      "word_id": 286,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 287,
      "word_id": 287,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 288,
      "word_id": 288,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 289,
      "word_id": 289,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 290,
      "word_id": 290,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 291,
      "word_id": 291,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 292,
      "word_id": 292,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 293,
      "word_id": 293,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 294,
      "word_id": 294,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 295,
      "word_id": 295,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 296,
      "word_id": 296,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 297,
      "word_id": 297,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 298,
      "word_id": 298,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 299,
      "word_id": 299,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 300,
      "word_id": 300,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 301,
      "word_id": 301,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 302,
      "word_id": 302,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 303,
      "word_id": 303,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 304,
      "word_id": 304,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 305,
      "word_id": 305,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 306,
      "word_id": 306,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 307,
      "word_id": 307,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 308,
      "word_id": 308,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 309,
      "word_id": 309,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 310,
      "word_id": 310,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 311,
      "word_id": 311,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 312,
      "word_id": 312,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 313,
      "word_id": 313,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 314,
      "word_id": 314,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 315,
      "word_id": 315,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 316,
      "word_id": 316,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 317,
      "word_id": 317,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 318,
      "word_id": 318,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 319,
      "word_id": 319,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 320,
      "word_id": 320,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 321,
      "word_id": 321,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 322,
      "word_id": 322,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 323,
      "word_id": 323,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 324,
      "word_id": 324,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 325,
      "word_id": 325,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 326,
      "word_id": 326,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 327,
      "word_id": 327,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 328,
      "word_id": 328,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 329,
      "word_id": 329,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 330,
      "word_id": 330,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 331,
      "word_id": 331,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 332,
      "word_id": 332,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 333,
      "word_id": 333,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 334,
      "word_id": 334,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 335,
      "word_id": 335,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 336,
      "word_id": 336,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 337,
      "word_id": 337,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 338,
      "word_id": 338,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 339,
      "word_id": 339,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 340,
      "word_id": 340,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 341,
      "word_id": 341,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 342,
      "word_id": 342,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 343,
      "word_id": 343,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 344,
      "word_id": 344,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 345,
      "word_id": 345,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 346,
      "word_id": 346,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 347,
      "word_id": 347,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 348,
      "word_id": 348,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 349,
      "word_id": 349,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 350,
      "word_id": 350,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 351,
      "word_id": 351,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 352,
      "word_id": 352,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 353,
      "word_id": 353,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 354,
      "word_id": 354,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 355,
      "word_id": 355,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 356,
      "word_id": 356,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 357,
      "word_id": 357,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 358,
      "word_id": 358,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 359,
      "word_id": 359,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 360,
      "word_id": 360,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 361,
      "word_id": 361,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 362,
      "word_id": 362,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 363,
      "word_id": 363,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 364,
      "word_id": 364,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 365,
      "word_id": 365,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 366,
      "word_id": 366,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 367,
      "word_id": 367,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 368,
      "word_id": 368,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 369,
      "word_id": 369,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 370,
      "word_id": 370,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 371,
      "word_id": 371,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 372,
      "word_id": 372,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 373,
      "word_id": 373,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 374,
      "word_id": 374,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 375,
      "word_id": 375,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 376,
      "word_id": 376,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 377,
      "word_id": 377,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 378,
      "word_id": 378,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 379,
      "word_id": 379,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 380,
      "word_id": 380,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 381,
      "word_id": 381,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 382,
      "word_id": 382,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 383,
      "word_id": 383,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 384,
      "word_id": 384,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 385,
      "word_id": 385,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 386,
      "word_id": 386,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 387,
      "word_id": 387,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 388,
      "word_id": 388,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 389,
      "word_id": 389,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 390,
      "word_id": 390,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 391,
      "word_id": 391,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 392,
      "word_id": 392,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 393,
      "word_id": 393,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 394,
      "word_id": 394,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 395,
      "word_id": 395,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 396,
      "word_id": 396,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 397,
      "word_id": 397,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 398,
      "word_id": 398,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 399,
      "word_id": 399,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 400,
      "word_id": 400,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 401,
      "word_id": 401,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 402,
      "word_id": 402,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 403,
      "word_id": 403,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 404,
      "word_id": 404,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 405,
      "word_id": 405,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 406,
      "word_id": 406,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 407,
      "word_id": 407,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 408,
      "word_id": 408,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 409,
      "word_id": 409,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 410,
      "word_id": 410,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 411,
      "word_id": 411,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 412,
      "word_id": 412,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 413,
      "word_id": 413,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 414,
      "word_id": 414,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 415,
      "word_id": 415,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 416,
      "word_id": 416,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 417,
      "word_id": 417,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 418,
      "word_id": 418,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 419,
      "word_id": 419,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 420,
      "word_id": 420,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 421,
      "word_id": 421,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 422,
      "word_id": 422,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 423,
      "word_id": 423,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 424,
      "word_id": 424,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 425,
      "word_id": 425,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 426,
      "word_id": 426,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 427,
      "word_id": 427,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 428,
      "word_id": 428,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 429,
      "word_id": 429,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 430,
      "word_id": 430,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 431,
      "word_id": 431,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 432,
      "word_id": 432,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 433,
      "word_id": 433,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 434,
      "word_id": 434,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 435,
      "word_id": 435,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 436,
      "word_id": 436,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 437,
      "word_id": 437,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 438,
      "word_id": 438,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 439,
      "word_id": 439,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 440,
      "word_id": 440,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 441,
      "word_id": 441,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 442,
      "word_id": 442,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 443,
      "word_id": 443,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 444,
      "word_id": 444,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 445,
      "word_id": 445,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 446,
      "word_id": 446,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 447,
      "word_id": 447,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 448,
      "word_id": 448,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 449,
      "word_id": 449,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 450,
      "word_id": 450,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 451,
      "word_id": 451,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 452,
      "word_id": 452,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 453,
      "word_id": 453,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 454,
      "word_id": 454,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 455,
      "word_id": 455,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 456,
      "word_id": 456,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 457,
      "word_id": 457,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 458,
      "word_id": 458,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 459,
      "word_id": 459,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 460,
      "word_id": 460,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 461,
      "word_id": 461,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 462,
      "word_id": 462,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 463,
      "word_id": 463,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 464,
      "word_id": 464,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 465,
      "word_id": 465,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 466,
      "word_id": 466,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 467,
      "word_id": 467,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 468,
      "word_id": 468,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 469,
      "word_id": 469,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 470,
      "word_id": 470,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 471,
      "word_id": 471,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 472,
      "word_id": 472,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 473,
      "word_id": 473,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 474,
      "word_id": 474,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 475,
      "word_id": 475,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 476,
      "word_id": 476,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 477,
      "word_id": 477,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 478,
      "word_id": 478,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 479,
      "word_id": 479,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 480,
      "word_id": 480,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 481,
      "word_id": 481,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 482,
      "word_id": 482,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 483,
      "word_id": 483,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 484,
      "word_id": 484,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 485,
      "word_id": 485,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 486,
      "word_id": 486,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 487,
      "word_id": 487,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 488,
      "word_id": 488,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 489,
      "word_id": 489,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 490,
      "word_id": 490,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 491,
      "word_id": 491,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 492,
      "word_id": 492,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 493,
      "word_id": 493,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 494,
      "word_id": 494,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 495,
      "word_id": 495,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 496,
      "word_id": 496,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 497,
      "word_id": 497,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 498,
      "word_id": 498,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 499,
      "word_id": 499,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 500,
      "word_id": 500,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 501,
      "word_id": 501,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 502,
      "word_id": 502,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 503,
      "word_id": 503,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 504,
      "word_id": 504,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 505,
      "word_id": 505,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 506,
      "word_id": 506,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 507,
      "word_id": 507,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 508,
      "word_id": 508,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 509,
      "word_id": 509,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 510,
      "word_id": 510,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 511,
      "word_id": 511,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 512,
      "word_id": 512,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 513,
      "word_id": 513,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 514,
      "word_id": 514,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 515,
      "word_id": 515,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 516,
      "word_id": 516,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 517,
      "word_id": 517,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 518,
      "word_id": 518,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 519,
      "word_id": 519,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 520,
      "word_id": 520,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 521,
      "word_id": 521,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 522,
      "word_id": 522,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 523,
      "word_id": 523,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 524,
      "word_id": 524,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 525,
      "word_id": 525,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 526,
      "word_id": 526,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 527,
      "word_id": 527,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 528,
      "word_id": 528,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 529,
      "word_id": 529,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 530,
      "word_id": 530,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 531,
      "word_id": 531,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 532,
      "word_id": 532,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 533,
      "word_id": 533,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 534,
      "word_id": 534,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 535,
      "word_id": 535,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 536,
      "word_id": 536,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 537,
      "word_id": 537,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 538,
      "word_id": 538,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 539,
      "word_id": 539,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 540,
      "word_id": 540,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 541,
      "word_id": 541,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 542,
      "word_id": 542,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 543,
      "word_id": 543,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 544,
      "word_id": 544,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 545,
      "word_id": 545,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 546,
      "word_id": 546,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 547,
      "word_id": 547,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 548,
      "word_id": 548,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 549,
      "word_id": 549,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 550,
      "word_id": 550,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 551,
      "word_id": 551,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 552,
      "word_id": 552,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 553,
      "word_id": 553,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 554,
      "word_id": 554,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 555,
      "word_id": 555,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 556,
      "word_id": 556,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 557,
      "word_id": 557,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 558,
      "word_id": 558,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 559,
      "word_id": 559,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 560,
      "word_id": 560,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 561,
      "word_id": 561,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 562,
      "word_id": 562,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 563,
      "word_id": 563,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 564,
      "word_id": 564,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 565,
      "word_id": 565,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 566,
      "word_id": 566,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 567,
      "word_id": 567,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 568,
      "word_id": 568,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 569,
      "word_id": 569,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 570,
      "word_id": 570,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 571,
      "word_id": 571,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 572,
      "word_id": 572,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 573,
      "word_id": 573,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 574,
      "word_id": 574,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 575,
      "word_id": 575,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 576,
      "word_id": 576,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 577,
      "word_id": 577,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 578,
      "word_id": 578,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 579,
      "word_id": 579,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 580,
      "word_id": 580,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 581,
      "word_id": 581,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 582,
      "word_id": 582,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 583,
      "word_id": 583,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 584,
      "word_id": 584,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 585,
      "word_id": 585,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 586,
      "word_id": 586,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 587,
      "word_id": 587,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 588,
      "word_id": 588,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 589,
      "word_id": 589,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 590,
      "word_id": 590,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 591,
      "word_id": 591,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 592,
      "word_id": 592,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 593,
      "word_id": 593,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 594,
      "word_id": 594,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 595,
      "word_id": 595,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 596,
      "word_id": 596,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 597,
      "word_id": 597,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 598,
      "word_id": 598,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 599,
      "word_id": 599,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 600,
      "word_id": 600,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 601,
      "word_id": 601,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 602,
      "word_id": 602,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 603,
      "word_id": 603,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 604,
      "word_id": 604,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 605,
      "word_id": 605,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 606,
      "word_id": 606,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 607,
      "word_id": 607,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 608,
      "word_id": 608,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 609,
      "word_id": 609,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 610,
      "word_id": 610,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 611,
      "word_id": 611,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 612,
      "word_id": 612,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 613,
      "word_id": 613,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 614,
      "word_id": 614,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 615,
      "word_id": 615,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 616,
      "word_id": 616,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 617,
      "word_id": 617,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 618,
      "word_id": 618,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 619,
      "word_id": 619,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 620,
      "word_id": 620,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 621,
      "word_id": 621,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 622,
      "word_id": 622,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 623,
      "word_id": 623,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 624,
      "word_id": 624,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 625,
      "word_id": 625,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 626,
      "word_id": 626,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 627,
      "word_id": 627,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 628,
      "word_id": 628,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 629,
      "word_id": 629,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 630,
      "word_id": 630,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 631,
      "word_id": 631,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 632,
      "word_id": 632,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 633,
      "word_id": 633,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 634,
      "word_id": 634,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 635,
      "word_id": 635,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 636,
      "word_id": 636,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 637,
      "word_id": 637,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 638,
      "word_id": 638,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 639,
      "word_id": 639,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 640,
      "word_id": 640,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 641,
      "word_id": 641,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 642,
      "word_id": 642,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 643,
      "word_id": 643,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 644,
      "word_id": 644,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 645,
      "word_id": 645,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 646,
      "word_id": 646,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 647,
      "word_id": 647,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 648,
      "word_id": 648,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 649,
      "word_id": 649,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 650,
      "word_id": 650,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 651,
      "word_id": 651,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 652,
      "word_id": 652,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 653,
      "word_id": 653,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 654,
      "word_id": 654,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 655,
      "word_id": 655,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 656,
      "word_id": 656,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 657,
      "word_id": 657,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 658,
      "word_id": 658,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 659,
      "word_id": 659,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 660,
      "word_id": 660,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 661,
      "word_id": 661,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 662,
      "word_id": 662,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 663,
      "word_id": 663,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 664,
      "word_id": 664,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 665,
      "word_id": 665,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 666,
      "word_id": 666,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 667,
      "word_id": 667,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 668,
      "word_id": 668,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 669,
      "word_id": 669,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 670,
      "word_id": 670,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 671,
      "word_id": 671,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 672,
      "word_id": 672,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 673,
      "word_id": 673,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 674,
      "word_id": 674,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 675,
      "word_id": 675,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 676,
      "word_id": 676,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 677,
      "word_id": 677,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 678,
      "word_id": 678,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 679,
      "word_id": 679,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 680,
      "word_id": 680,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 681,
      "word_id": 681,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 682,
      "word_id": 682,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 683,
      "word_id": 683,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 684,
      "word_id": 684,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 685,
      "word_id": 685,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 686,
      "word_id": 686,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 687,
      "word_id": 687,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 688,
      "word_id": 688,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 689,
      "word_id": 689,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 690,
      "word_id": 690,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 691,
      "word_id": 691,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 692,
      "word_id": 692,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 693,
      "word_id": 693,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 694,
      "word_id": 694,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 695,
      "word_id": 695,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 696,
      "word_id": 696,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 697,
      "word_id": 697,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 698,
      "word_id": 698,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 699,
      "word_id": 699,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 700,
      "word_id": 700,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 701,
      "word_id": 701,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 702,
      "word_id": 702,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 703,
      "word_id": 703,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 704,
      "word_id": 704,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 705,
      "word_id": 705,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 706,
      "word_id": 706,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 707,
      "word_id": 707,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 708,
      "word_id": 708,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 709,
      "word_id": 709,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 710,
      "word_id": 710,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 711,
      "word_id": 711,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 712,
      "word_id": 712,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 713,
      "word_id": 713,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 714,
      "word_id": 714,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 715,
      "word_id": 715,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 716,
      "word_id": 716,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 717,
      "word_id": 717,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 718,
      "word_id": 718,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 719,
      "word_id": 719,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 720,
      "word_id": 720,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 721,
      "word_id": 721,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 722,
      "word_id": 722,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 723,
      "word_id": 723,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 724,
      "word_id": 724,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 725,
      "word_id": 725,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 726,
      "word_id": 726,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 727,
      "word_id": 727,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 728,
      "word_id": 728,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 729,
      "word_id": 729,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 730,
      "word_id": 730,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 731,
      "word_id": 731,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 732,
      "word_id": 732,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 733,
      "word_id": 733,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 734,
      "word_id": 734,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 735,
      "word_id": 735,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 736,
      "word_id": 736,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 737,
      "word_id": 737,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 738,
      "word_id": 738,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 739,
      "word_id": 739,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 740,
      "word_id": 740,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 741,
      "word_id": 741,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 742,
      "word_id": 742,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 743,
      "word_id": 743,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 744,
      "word_id": 744,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 745,
      "word_id": 745,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 746,
      "word_id": 746,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 747,
      "word_id": 747,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 748,
      "word_id": 748,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 749,
      "word_id": 749,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 750,
      "word_id": 750,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 751,
      "word_id": 751,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 752,
      "word_id": 752,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 753,
      "word_id": 753,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 754,
      "word_id": 754,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 755,
      "word_id": 755,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 756,
      "word_id": 756,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 757,
      "word_id": 757,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 758,
      "word_id": 758,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 759,
      "word_id": 759,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 760,
      "word_id": 760,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 761,
      "word_id": 761,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 762,
      "word_id": 762,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 763,
      "word_id": 763,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 764,
      "word_id": 764,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 765,
      "word_id": 765,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 766,
      "word_id": 766,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 767,
      "word_id": 767,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 768,
      "word_id": 768,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 769,
      "word_id": 769,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 770,
      "word_id": 770,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 771,
      "word_id": 771,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 772,
      "word_id": 772,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 773,
      "word_id": 773,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 774,
      "word_id": 774,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 775,
      "word_id": 775,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 776,
      "word_id": 776,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 777,
      "word_id": 777,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 778,
      "word_id": 778,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 779,
      "word_id": 779,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 780,
      "word_id": 780,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 781,
      "word_id": 781,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 782,
      "word_id": 782,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 783,
      "word_id": 783,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 784,
      "word_id": 784,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 785,
      "word_id": 785,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 786,
      "word_id": 786,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 787,
      "word_id": 787,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 788,
      "word_id": 788,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 789,
      "word_id": 789,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 790,
      "word_id": 790,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 791,
      "word_id": 791,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 792,
      "word_id": 792,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 793,
      "word_id": 793,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 794,
      "word_id": 794,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 795,
      "word_id": 795,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 796,
      "word_id": 796,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 797,
      "word_id": 797,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 798,
      "word_id": 798,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 799,
      "word_id": 799,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 800,
      "word_id": 800,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 801,
      "word_id": 801,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 802,
      "word_id": 802,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 803,
      "word_id": 803,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 804,
      "word_id": 804,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 805,
      "word_id": 805,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 806,
      "word_id": 806,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 807,
      "word_id": 807,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 808,
      "word_id": 808,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 809,
      "word_id": 809,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 810,
      "word_id": 810,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 811,
      "word_id": 811,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 812,
      "word_id": 812,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 813,
      "word_id": 813,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 814,
      "word_id": 814,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 815,
      "word_id": 815,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 816,
      "word_id": 816,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 817,
      "word_id": 817,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 818,
      "word_id": 818,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 819,
      "word_id": 819,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 820,
      "word_id": 820,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 821,
      "word_id": 821,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 822,
      "word_id": 822,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 823,
      "word_id": 823,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 824,
      "word_id": 824,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 825,
      "word_id": 825,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 826,
      "word_id": 826,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 827,
      "word_id": 827,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 828,
      "word_id": 828,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 829,
      "word_id": 829,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 830,
      "word_id": 830,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 831,
      "word_id": 831,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 832,
      "word_id": 832,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 833,
      "word_id": 833,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 834,
      "word_id": 834,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 835,
      "word_id": 835,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 836,
      "word_id": 836,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 837,
      "word_id": 837,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 838,
      "word_id": 838,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 839,
      "word_id": 839,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 840,
      "word_id": 840,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 841,
      "word_id": 841,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 842,
      "word_id": 842,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 843,
      "word_id": 843,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 844,
      "word_id": 844,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 845,
      "word_id": 845,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 846,
      "word_id": 846,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 847,
      "word_id": 847,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 848,
      "word_id": 848,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 849,
      "word_id": 849,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 850,
      "word_id": 850,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 851,
      "word_id": 851,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 852,
      "word_id": 852,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 853,
      "word_id": 853,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 854,
      "word_id": 854,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 855,
      "word_id": 855,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 856,
      "word_id": 856,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 857,
      "word_id": 857,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 858,
      "word_id": 858,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 859,
      "word_id": 859,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 860,
      "word_id": 860,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 861,
      "word_id": 861,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 862,
      "word_id": 862,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 863,
      "word_id": 863,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 864,
      "word_id": 864,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 865,
      "word_id": 865,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 866,
      "word_id": 866,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 867,
      "word_id": 867,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 868,
      "word_id": 868,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 869,
      "word_id": 869,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 870,
      "word_id": 870,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 871,
      "word_id": 871,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 872,
      "word_id": 872,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 873,
      "word_id": 873,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 874,
      "word_id": 874,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 875,
      "word_id": 875,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 876,
      "word_id": 876,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 877,
      "word_id": 877,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 878,
      "word_id": 878,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 879,
      "word_id": 879,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 880,
      "word_id": 880,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 881,
      "word_id": 881,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 882,
      "word_id": 882,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 883,
      "word_id": 883,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 884,
      "word_id": 884,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 885,
      "word_id": 885,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 886,
      "word_id": 886,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 887,
      "word_id": 887,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 888,
      "word_id": 888,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 889,
      "word_id": 889,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 890,
      "word_id": 890,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 891,
      "word_id": 891,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 892,
      "word_id": 892,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 893,
      "word_id": 893,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 894,
      "word_id": 894,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 895,
      "word_id": 895,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 896,
      "word_id": 896,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 897,
      "word_id": 897,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 898,
      "word_id": 898,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 899,
      "word_id": 899,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 900,
      "word_id": 900,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 901,
      "word_id": 901,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 902,
      "word_id": 902,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 903,
      "word_id": 903,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 904,
      "word_id": 904,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 905,
      "word_id": 905,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 906,
      "word_id": 906,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 907,
      "word_id": 907,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 908,
      "word_id": 908,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 909,
      "word_id": 909,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 910,
      "word_id": 910,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 911,
      "word_id": 911,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 912,
      "word_id": 912,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 913,
      "word_id": 913,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 914,
      "word_id": 914,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 915,
      "word_id": 915,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 916,
      "word_id": 916,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 917,
      "word_id": 917,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 918,
      "word_id": 918,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 919,
      "word_id": 919,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 920,
      "word_id": 920,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 921,
      "word_id": 921,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 922,
      "word_id": 922,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 923,
      "word_id": 923,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 924,
      "word_id": 924,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 925,
      "word_id": 925,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 926,
      "word_id": 926,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 927,
      "word_id": 927,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 928,
      "word_id": 928,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 929,
      "word_id": 929,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 930,
      "word_id": 930,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 931,
      "word_id": 931,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 932,
      "word_id": 932,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 933,
      "word_id": 933,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 934,
      "word_id": 934,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 935,
      "word_id": 935,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 936,
      "word_id": 936,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 937,
      "word_id": 937,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 938,
      "word_id": 938,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 939,
      "word_id": 939,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 940,
      "word_id": 940,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 941,
      "word_id": 941,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 942,
      "word_id": 942,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 943,
      "word_id": 943,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 944,
      "word_id": 944,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 945,
      "word_id": 945,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 946,
      "word_id": 946,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 947,
      "word_id": 947,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 948,
      "word_id": 948,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 949,
      "word_id": 949,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 950,
      "word_id": 950,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 951,
      "word_id": 951,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 952,
      "word_id": 952,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 953,
      "word_id": 953,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 954,
      "word_id": 954,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 955,
      "word_id": 955,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 956,
      "word_id": 956,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 957,
      "word_id": 957,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 958,
      "word_id": 958,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 959,
      "word_id": 959,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 960,
      "word_id": 960,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 961,
      "word_id": 961,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 962,
      "word_id": 962,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 963,
      "word_id": 963,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 964,
      "word_id": 264,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 965,
      "word_id": 964,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 966,
      "word_id": 965,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 967,
      "word_id": 966,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 968,
      "word_id": 967,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 969,
      "word_id": 968,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 970,
      "word_id": 969,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 971,
      "word_id": 970,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 972,
      "word_id": 971,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 973,
      "word_id": 972,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 974,
      "word_id": 973,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 975,
      "word_id": 974,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 976,
      "word_id": 975,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 977,
      "word_id": 976,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 978,
      "word_id": 977,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 979,
      "word_id": 978,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 980,
      "word_id": 979,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 981,
      "word_id": 980,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 982,
      "word_id": 981,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 983,
      "word_id": 982,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 984,
      "word_id": 983,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 985,
      "word_id": 984,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 986,
      "word_id": 985,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 987,
      "word_id": 986,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 988,
      "word_id": 987,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 989,
      "word_id": 988,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 990,
      "word_id": 989,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 991,
      "word_id": 990,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 992,
      "word_id": 991,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 993,
      "word_id": 992,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 994,
      "word_id": 993,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 995,
      "word_id": 994,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 996,
      "word_id": 995,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 997,
      "word_id": 996,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 998,
      "word_id": 997,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 999,
      "word_id": 998,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1000,
      "word_id": 999,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1001,
      "word_id": 1000,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1002,
      "word_id": 1001,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1003,
      "word_id": 1002,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1004,
      "word_id": 1003,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1005,
      "word_id": 1004,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1006,
      "word_id": 1005,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1007,
      "word_id": 1006,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1008,
      "word_id": 1007,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1009,
      "word_id": 1008,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1010,
      "word_id": 1009,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1011,
      "word_id": 1010,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1012,
      "word_id": 1011,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1013,
      "word_id": 1012,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1014,
      "word_id": 1013,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1015,
      "word_id": 1014,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1016,
      "word_id": 1015,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1017,
      "word_id": 1016,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1018,
      "word_id": 1017,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1019,
      "word_id": 1018,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1020,
      "word_id": 1019,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1021,
      "word_id": 1020,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1022,
      "word_id": 1021,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1023,
      "word_id": 1022,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1024,
      "word_id": 1023,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1025,
      "word_id": 1024,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1026,
      "word_id": 1025,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1027,
      "word_id": 1026,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1028,
      "word_id": 1027,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1029,
      "word_id": 1028,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1030,
      "word_id": 1029,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1031,
      "word_id": 1030,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1032,
      "word_id": 1031,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1033,
      "word_id": 1032,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1034,
      "word_id": 1033,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1035,
      "word_id": 1034,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1036,
      "word_id": 1035,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1037,
      "word_id": 1036,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1038,
      "word_id": 1037,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1039,
      "word_id": 1038,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1040,
      "word_id": 1039,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1041,
      "word_id": 1040,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1042,
      "word_id": 1041,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1043,
      "word_id": 1042,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1044,
      "word_id": 1043,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1045,
      "word_id": 1044,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1046,
      "word_id": 1045,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1047,
      "word_id": 1046,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1048,
      "word_id": 1047,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1049,
      "word_id": 1048,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1050,
      "word_id": 1049,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1051,
      "word_id": 1050,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1052,
      "word_id": 1051,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1053,
      "word_id": 1052,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1054,
      "word_id": 1053,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1055,
      "word_id": 1054,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1056,
      "word_id": 1055,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1057,
      "word_id": 1056,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1058,
      "word_id": 1057,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1059,
      "word_id": 1058,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1060,
      "word_id": 1059,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1061,
      "word_id": 1060,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1062,
      "word_id": 1061,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1063,
      "word_id": 1062,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1064,
      "word_id": 1063,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1065,
      "word_id": 1064,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1066,
      "word_id": 1065,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1067,
      "word_id": 1066,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1068,
      "word_id": 1067,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1069,
      "word_id": 1068,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1070,
      "word_id": 1069,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1071,
      "word_id": 1070,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1072,
      "word_id": 1071,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1073,
      "word_id": 1072,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1074,
      "word_id": 1073,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1075,
      "word_id": 1074,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1076,
      "word_id": 1075,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1077,
      "word_id": 1076,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1078,
      "word_id": 1077,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1079,
      "word_id": 1078,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1080,
      "word_id": 1079,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1081,
      "word_id": 1080,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1082,
      "word_id": 1081,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1083,
      "word_id": 1082,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1084,
      "word_id": 1083,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1085,
      "word_id": 1084,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1086,
      "word_id": 1085,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1087,
      "word_id": 1086,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1088,
      "word_id": 1087,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1089,
      "word_id": 1088,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1090,
      "word_id": 1089,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1091,
      "word_id": 1090,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1092,
      "word_id": 1091,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1093,
      "word_id": 1092,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1094,
      "word_id": 1093,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1095,
      "word_id": 1094,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1096,
      "word_id": 1095,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1097,
      "word_id": 1096,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1098,
      "word_id": 1097,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1099,
      "word_id": 1098,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1100,
      "word_id": 1099,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1101,
      "word_id": 1100,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1102,
      "word_id": 1101,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1103,
      "word_id": 1102,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1104,
      "word_id": 1103,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1105,
      "word_id": 1104,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1106,
      "word_id": 1105,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1107,
      "word_id": 1106,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1108,
      "word_id": 1107,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1109,
      "word_id": 1108,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1110,
      "word_id": 1109,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1111,
      "word_id": 1110,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1112,
      "word_id": 1111,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1113,
      "word_id": 1112,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1114,
      "word_id": 1113,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1115,
      "word_id": 1114,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1116,
      "word_id": 1115,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1117,
      "word_id": 1116,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1118,
      "word_id": 1117,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1119,
      "word_id": 1118,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1120,
      "word_id": 1119,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1121,
      "word_id": 1120,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1122,
      "word_id": 1121,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1123,
      "word_id": 1122,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1124,
      "word_id": 1123,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1125,
      "word_id": 1124,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1126,
      "word_id": 1125,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1127,
      "word_id": 1126,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1128,
      "word_id": 1127,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1129,
      "word_id": 1128,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1130,
      "word_id": 1129,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1131,
      "word_id": 1130,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1132,
      "word_id": 1131,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1133,
      "word_id": 1132,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1134,
      "word_id": 1133,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1135,
      "word_id": 1134,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1136,
      "word_id": 1135,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1137,
      "word_id": 1136,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1138,
      "word_id": 1137,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1139,
      "word_id": 1138,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1140,
      "word_id": 1139,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1141,
      "word_id": 1140,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1142,
      "word_id": 1141,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1143,
      "word_id": 1142,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1144,
      "word_id": 1143,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1145,
      "word_id": 1144,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1146,
      "word_id": 1145,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1147,
      "word_id": 1146,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1148,
      "word_id": 1147,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1149,
      "word_id": 1148,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1150,
      "word_id": 1149,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1151,
      "word_id": 1150,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1152,
      "word_id": 1151,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1153,
      "word_id": 1152,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1154,
      "word_id": 1153,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1155,
      "word_id": 1154,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1156,
      "word_id": 1155,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1157,
      "word_id": 1156,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1158,
      "word_id": 1157,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1159,
      "word_id": 1158,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1160,
      "word_id": 1159,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1161,
      "word_id": 1160,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1162,
      "word_id": 1161,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1163,
      "word_id": 1162,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1164,
      "word_id": 1163,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1165,
      "word_id": 1164,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1166,
      "word_id": 1165,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1167,
      "word_id": 1166,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1168,
      "word_id": 1167,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1169,
      "word_id": 1168,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1170,
      "word_id": 1169,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1171,
      "word_id": 1170,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1172,
      "word_id": 1171,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1173,
      "word_id": 1172,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1174,
      "word_id": 1173,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1175,
      "word_id": 1174,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1176,
      "word_id": 1175,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1177,
      "word_id": 1176,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1178,
      "word_id": 1177,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1179,
      "word_id": 1178,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1180,
      "word_id": 1179,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1181,
      "word_id": 1180,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1182,
      "word_id": 1181,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1183,
      "word_id": 1182,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1184,
      "word_id": 1183,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1185,
      "word_id": 1184,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1186,
      "word_id": 1185,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1187,
      "word_id": 1186,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1188,
      "word_id": 1187,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1189,
      "word_id": 1188,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1190,
      "word_id": 1189,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1191,
      "word_id": 1190,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1192,
      "word_id": 1191,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1193,
      "word_id": 1192,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1194,
      "word_id": 1193,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1195,
      "word_id": 1194,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1196,
      "word_id": 1195,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1197,
      "word_id": 1196,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1198,
      "word_id": 1197,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1199,
      "word_id": 1198,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1200,
      "word_id": 1199,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1201,
      "word_id": 1200,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1202,
      "word_id": 1201,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1203,
      "word_id": 1202,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1204,
      "word_id": 1203,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1205,
      "word_id": 1204,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1206,
      "word_id": 1205,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1207,
      "word_id": 1206,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1208,
      "word_id": 1207,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1209,
      "word_id": 1208,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1210,
      "word_id": 1209,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1211,
      "word_id": 1210,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1212,
      "word_id": 1211,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1213,
      "word_id": 1212,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1214,
      "word_id": 1213,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1215,
      "word_id": 1214,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1216,
      "word_id": 1215,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1217,
      "word_id": 1216,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1218,
      "word_id": 1217,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1219,
      "word_id": 1218,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1220,
      "word_id": 1219,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1221,
      "word_id": 1220,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1222,
      "word_id": 1221,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1223,
      "word_id": 1222,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1224,
      "word_id": 1223,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1225,
      "word_id": 1224,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1226,
      "word_id": 1225,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1227,
      "word_id": 1226,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1228,
      "word_id": 1227,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1229,
      "word_id": 1228,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1230,
      "word_id": 1229,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1231,
      "word_id": 1230,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1232,
      "word_id": 1231,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1233,
      "word_id": 1232,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1234,
      "word_id": 1233,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1235,
      "word_id": 1234,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1236,
      "word_id": 1235,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1237,
      "word_id": 1236,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1238,
      "word_id": 1237,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1239,
      "word_id": 1238,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1240,
      "word_id": 1239,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1241,
      "word_id": 1240,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1242,
      "word_id": 1241,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1243,
      "word_id": 1242,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1244,
      "word_id": 1243,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1245,
      "word_id": 1244,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1246,
      "word_id": 1245,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1247,
      "word_id": 1246,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1248,
      "word_id": 1247,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1249,
      "word_id": 1248,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1250,
      "word_id": 1249,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1251,
      "word_id": 1250,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1252,
      "word_id": 1251,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1253,
      "word_id": 1252,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1254,
      "word_id": 1253,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1255,
      "word_id": 1254,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1256,
      "word_id": 1255,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1257,
      "word_id": 1256,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1258,
      "word_id": 1257,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1259,
      "word_id": 1258,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1260,
      "word_id": 1259,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1261,
      "word_id": 1260,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1262,
      "word_id": 1261,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1263,
      "word_id": 1262,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1264,
      "word_id": 1263,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1265,
      "word_id": 1264,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1266,
      "word_id": 1265,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1267,
      "word_id": 1266,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1268,
      "word_id": 1267,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1269,
      "word_id": 1268,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1270,
      "word_id": 1269,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1271,
      "word_id": 1270,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1272,
      "word_id": 1271,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1273,
      "word_id": 1272,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1274,
      "word_id": 1273,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1275,
      "word_id": 1274,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1276,
      "word_id": 1275,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1277,
      "word_id": 1276,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1278,
      "word_id": 1277,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1279,
      "word_id": 1278,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1280,
      "word_id": 1279,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1281,
      "word_id": 1280,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1282,
      "word_id": 1281,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1283,
      "word_id": 1282,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1284,
      "word_id": 1283,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1285,
      "word_id": 1284,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1286,
      "word_id": 1285,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1287,
      "word_id": 1286,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1288,
      "word_id": 1287,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1289,
      "word_id": 1288,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1290,
      "word_id": 1289,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1291,
      "word_id": 1290,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1292,
      "word_id": 1291,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1293,
      "word_id": 1292,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1294,
      "word_id": 1293,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1295,
      "word_id": 1294,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1296,
      "word_id": 1295,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1297,
      "word_id": 1296,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1298,
      "word_id": 1297,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1299,
      "word_id": 1298,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1300,
      "word_id": 1299,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1301,
      "word_id": 1300,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1302,
      "word_id": 1301,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1303,
      "word_id": 1302,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1304,
      "word_id": 1303,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1305,
      "word_id": 1304,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1306,
      "word_id": 1305,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1307,
      "word_id": 1306,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1308,
      "word_id": 1307,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1309,
      "word_id": 1308,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1310,
      "word_id": 1309,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1311,
      "word_id": 1310,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1312,
      "word_id": 1311,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1313,
      "word_id": 1312,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1314,
      "word_id": 1313,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1315,
      "word_id": 1314,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1316,
      "word_id": 1315,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1317,
      "word_id": 1316,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1318,
      "word_id": 1317,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1319,
      "word_id": 1318,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1320,
      "word_id": 1319,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1321,
      "word_id": 1320,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1322,
      "word_id": 1321,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1323,
      "word_id": 1322,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1324,
      "word_id": 1323,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1325,
      "word_id": 1324,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1326,
      "word_id": 1325,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1327,
      "word_id": 1326,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1328,
      "word_id": 1327,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1329,
      "word_id": 1328,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1330,
      "word_id": 1329,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1331,
      "word_id": 1330,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1332,
      "word_id": 1331,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1333,
      "word_id": 1332,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1334,
      "word_id": 1333,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1335,
      "word_id": 1334,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1336,
      "word_id": 1335,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1337,
      "word_id": 1336,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1338,
      "word_id": 1337,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1339,
      "word_id": 1338,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1340,
      "word_id": 1339,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1341,
      "word_id": 1340,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1342,
      "word_id": 1341,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1343,
      "word_id": 1342,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1344,
      "word_id": 1343,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1345,
      "word_id": 1344,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1346,
      "word_id": 1345,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1347,
      "word_id": 1346,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1348,
      "word_id": 1347,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1349,
      "word_id": 1348,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1350,
      "word_id": 1349,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1351,
      "word_id": 1350,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1352,
      "word_id": 1351,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1353,
      "word_id": 1352,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1354,
      "word_id": 1353,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1355,
      "word_id": 1354,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1356,
      "word_id": 1355,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1357,
      "word_id": 1356,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1358,
      "word_id": 1357,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1359,
      "word_id": 1358,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1360,
      "word_id": 1359,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1361,
      "word_id": 1360,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1362,
      "word_id": 1361,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1363,
      "word_id": 1362,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1364,
      "word_id": 1363,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1365,
      "word_id": 1364,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1366,
      "word_id": 1365,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1367,
      "word_id": 1366,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1368,
      "word_id": 1367,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1369,
      "word_id": 1368,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1370,
      "word_id": 1369,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1371,
      "word_id": 1370,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1372,
      "word_id": 1371,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1373,
      "word_id": 1372,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1374,
      "word_id": 1373,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1375,
      "word_id": 1374,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1376,
      "word_id": 1375,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1377,
      "word_id": 1376,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1378,
      "word_id": 1377,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1379,
      "word_id": 1378,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1380,
      "word_id": 1379,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1381,
      "word_id": 1380,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1382,
      "word_id": 1381,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1383,
      "word_id": 1382,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1384,
      "word_id": 1383,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1385,
      "word_id": 1384,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1386,
      "word_id": 1385,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1387,
      "word_id": 1386,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1388,
      "word_id": 1387,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1389,
      "word_id": 1388,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1390,
      "word_id": 1389,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1391,
      "word_id": 1390,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1392,
      "word_id": 1391,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1393,
      "word_id": 1392,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1394,
      "word_id": 1393,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1395,
      "word_id": 1394,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1396,
      "word_id": 1395,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1397,
      "word_id": 1396,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1398,
      "word_id": 1397,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1399,
      "word_id": 1398,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1400,
      "word_id": 1399,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1401,
      "word_id": 1400,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1402,
      "word_id": 1401,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1403,
      "word_id": 1402,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1404,
      "word_id": 1403,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1405,
      "word_id": 1404,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1406,
      "word_id": 1405,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1407,
      "word_id": 1406,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1408,
      "word_id": 1407,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1409,
      "word_id": 1408,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1410,
      "word_id": 1409,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1411,
      "word_id": 1410,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1412,
      "word_id": 1411,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1413,
      "word_id": 1412,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1414,
      "word_id": 1413,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1415,
      "word_id": 1414,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1416,
      "word_id": 1415,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1417,
      "word_id": 1416,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1418,
      "word_id": 1417,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1419,
      "word_id": 1418,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1420,
      "word_id": 1419,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1421,
      "word_id": 1420,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1422,
      "word_id": 1421,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1423,
      "word_id": 1422,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1424,
      "word_id": 1423,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1425,
      "word_id": 1424,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1426,
      "word_id": 1425,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1427,
      "word_id": 1426,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1428,
      "word_id": 1427,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1429,
      "word_id": 1428,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1430,
      "word_id": 1429,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1431,
      "word_id": 1430,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1432,
      "word_id": 1431,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1433,
      "word_id": 1432,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1434,
      "word_id": 1433,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1435,
      "word_id": 1434,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1436,
      "word_id": 1435,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1437,
      "word_id": 1436,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1438,
      "word_id": 1437,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 1439,
      "word_id": 1438,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1440,
      "word_id": 1439,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1441,
      "word_id": 1440,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1442,
      "word_id": 1441,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1443,
      "word_id": 1442,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1444,
      "word_id": 1443,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1445,
      "word_id": 1444,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1446,
      "word_id": 1445,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1447,
      "word_id": 1446,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1448,
      "word_id": 1447,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1449,
      "word_id": 1448,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1450,
      "word_id": 1449,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1451,
      "word_id": 1450,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1452,
      "word_id": 1451,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1453,
      "word_id": 1452,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1454,
      "word_id": 1453,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1455,
      "word_id": 1454,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1456,
      "word_id": 1455,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1457,
      "word_id": 1456,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1458,
      "word_id": 1457,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1459,
      "word_id": 1458,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1460,
      "word_id": 1459,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1461,
      "word_id": 1460,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1462,
      "word_id": 1461,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1463,
      "word_id": 1462,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1464,
      "word_id": 1463,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1465,
      "word_id": 1464,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1466,
      "word_id": 1465,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1467,
      "word_id": 1466,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1468,
      "word_id": 1467,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1469,
      "word_id": 1468,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1470,
      "word_id": 1469,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1471,
      "word_id": 1470,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1472,
      "word_id": 1471,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1473,
      "word_id": 1472,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1474,
      "word_id": 1473,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1475,
      "word_id": 1474,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1476,
      "word_id": 1475,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1477,
      "word_id": 1476,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1478,
      "word_id": 1477,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1479,
      "word_id": 1478,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1480,
      "word_id": 1479,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1481,
      "word_id": 1480,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1482,
      "word_id": 1481,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1483,
      "word_id": 1482,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1484,
      "word_id": 1483,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1485,
      "word_id": 1484,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1486,
      "word_id": 1485,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1487,
      "word_id": 1486,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1488,
      "word_id": 1487,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1489,
      "word_id": 1488,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1490,
      "word_id": 1489,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1491,
      "word_id": 1490,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1492,
      "word_id": 1491,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1493,
      "word_id": 1492,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1494,
      "word_id": 1493,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1495,
      "word_id": 1494,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1496,
      "word_id": 1495,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1497,
      "word_id": 1496,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1498,
      "word_id": 1497,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1499,
      "word_id": 1498,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1500,
      "word_id": 1499,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1501,
      "word_id": 1500,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1502,
      "word_id": 1501,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1503,
      "word_id": 1502,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1504,
      "word_id": 1503,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1505,
      "word_id": 1504,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1506,
      "word_id": 1505,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1507,
      "word_id": 1506,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1508,
      "word_id": 1507,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1509,
      "word_id": 1508,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1510,
      "word_id": 1509,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1511,
      "word_id": 1510,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1512,
      "word_id": 1511,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1513,
      "word_id": 1512,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1514,
      "word_id": 1513,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1515,
      "word_id": 1514,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1516,
      "word_id": 1515,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1517,
      "word_id": 1516,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1518,
      "word_id": 1517,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1519,
      "word_id": 1518,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1520,
      "word_id": 1519,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1521,
      "word_id": 1520,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1522,
      "word_id": 1521,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1523,
      "word_id": 1522,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1524,
      "word_id": 1523,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1525,
      "word_id": 1524,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1526,
      "word_id": 1525,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1527,
      "word_id": 1526,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1528,
      "word_id": 1527,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1529,
      "word_id": 1528,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1530,
      "word_id": 1529,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1531,
      "word_id": 1530,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1532,
      "word_id": 1531,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1533,
      "word_id": 1532,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1534,
      "word_id": 1533,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1535,
      "word_id": 1534,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1536,
      "word_id": 1535,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1537,
      "word_id": 1536,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1538,
      "word_id": 1537,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1539,
      "word_id": 1538,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1540,
      "word_id": 1539,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1541,
      "word_id": 1540,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1542,
      "word_id": 1541,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1543,
      "word_id": 1542,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1544,
      "word_id": 1543,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1545,
      "word_id": 1544,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1546,
      "word_id": 1545,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1547,
      "word_id": 1546,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1548,
      "word_id": 1547,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1549,
      "word_id": 1548,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1550,
      "word_id": 1549,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1551,
      "word_id": 1550,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1552,
      "word_id": 1551,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1553,
      "word_id": 1552,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1554,
      "word_id": 1553,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1555,
      "word_id": 1554,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1556,
      "word_id": 1555,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1557,
      "word_id": 1556,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1558,
      "word_id": 1557,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1559,
      "word_id": 1558,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1560,
      "word_id": 1559,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1561,
      "word_id": 1560,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1562,
      "word_id": 1561,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1563,
      "word_id": 1562,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1564,
      "word_id": 1563,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1565,
      "word_id": 1564,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1566,
      "word_id": 1565,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1567,
      "word_id": 1566,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1568,
      "word_id": 1567,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1569,
      "word_id": 1568,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1570,
      "word_id": 1569,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1571,
      "word_id": 1570,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1572,
      "word_id": 1571,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1573,
      "word_id": 1572,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1574,
      "word_id": 1573,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1575,
      "word_id": 1574,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1576,
      "word_id": 1575,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1577,
      "word_id": 1576,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1578,
      "word_id": 1577,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1579,
      "word_id": 1578,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1580,
      "word_id": 1579,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1581,
      "word_id": 1580,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1582,
      "word_id": 1581,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1583,
      "word_id": 1582,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1584,
      "word_id": 1583,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1585,
      "word_id": 1584,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1586,
      "word_id": 1585,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1587,
      "word_id": 1586,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1588,
      "word_id": 1587,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1589,
      "word_id": 1588,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1590,
      "word_id": 1589,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1591,
      "word_id": 1590,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1592,
      "word_id": 1591,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1593,
      "word_id": 1592,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1594,
      "word_id": 1593,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1595,
      "word_id": 1594,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1596,
      "word_id": 1595,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1597,
      "word_id": 1596,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1598,
      "word_id": 1597,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1599,
      "word_id": 1598,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1600,
      "word_id": 1599,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1601,
      "word_id": 1600,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1602,
      "word_id": 1601,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1603,
      "word_id": 1602,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1604,
      "word_id": 1603,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1605,
      "word_id": 1604,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1606,
      "word_id": 1605,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1607,
      "word_id": 1606,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1608,
      "word_id": 1607,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1609,
      "word_id": 1608,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1610,
      "word_id": 1609,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1611,
      "word_id": 1610,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1612,
      "word_id": 1611,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1613,
      "word_id": 1612,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1614,
      "word_id": 1613,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1615,
      "word_id": 1614,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1616,
      "word_id": 1615,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1617,
      "word_id": 1616,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1618,
      "word_id": 1617,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1619,
      "word_id": 1618,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1620,
      "word_id": 1619,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1621,
      "word_id": 1620,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1622,
      "word_id": 1621,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1623,
      "word_id": 1622,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1624,
      "word_id": 1623,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1625,
      "word_id": 1624,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1626,
      "word_id": 1625,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1627,
      "word_id": 1626,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1628,
      "word_id": 1627,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1629,
      "word_id": 1628,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1630,
      "word_id": 1629,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1631,
      "word_id": 1630,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1632,
      "word_id": 1631,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1633,
      "word_id": 1632,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1634,
      "word_id": 1633,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1635,
      "word_id": 1634,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1636,
      "word_id": 1635,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1637,
      "word_id": 1636,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1638,
      "word_id": 1637,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1639,
      "word_id": 1638,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1640,
      "word_id": 1639,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1641,
      "word_id": 1640,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1642,
      "word_id": 1641,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1643,
      "word_id": 1642,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1644,
      "word_id": 1643,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1645,
      "word_id": 1644,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1646,
      "word_id": 1645,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1647,
      "word_id": 1646,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1648,
      "word_id": 1647,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1649,
      "word_id": 1648,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1650,
      "word_id": 1649,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1651,
      "word_id": 1650,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1652,
      "word_id": 1651,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1653,
      "word_id": 1652,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1654,
      "word_id": 1653,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1655,
      "word_id": 1654,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1656,
      "word_id": 1655,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1657,
      "word_id": 1656,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1658,
      "word_id": 1657,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1659,
      "word_id": 1658,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1660,
      "word_id": 1659,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1661,
      "word_id": 1660,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1662,
      "word_id": 1661,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1663,
      "word_id": 1662,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 1664,
      "word_id": 1663,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1665,
      "word_id": 1664,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1666,
      "word_id": 1665,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1667,
      "word_id": 1666,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1668,
      "word_id": 1667,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1669,
      "word_id": 1668,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1670,
      "word_id": 1669,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1671,
      "word_id": 1670,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1672,
      "word_id": 1671,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1673,
      "word_id": 1672,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1674,
      "word_id": 1673,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1675,
      "word_id": 1674,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1676,
      "word_id": 1675,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1677,
      "word_id": 1676,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1678,
      "word_id": 1677,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1679,
      "word_id": 1678,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1680,
      "word_id": 1679,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1681,
      "word_id": 1680,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1682,
      "word_id": 1681,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1683,
      "word_id": 1682,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1684,
      "word_id": 1683,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1685,
      "word_id": 1684,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1686,
      "word_id": 1685,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1687,
      "word_id": 1686,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1688,
      "word_id": 1687,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1689,
      "word_id": 1688,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1690,
      "word_id": 1689,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1691,
      "word_id": 1690,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1692,
      "word_id": 1691,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1693,
      "word_id": 1692,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1694,
      "word_id": 1693,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1695,
      "word_id": 1694,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1696,
      "word_id": 1695,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1697,
      "word_id": 1696,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1698,
      "word_id": 1697,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1699,
      "word_id": 1698,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1700,
      "word_id": 1699,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1701,
      "word_id": 1700,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1702,
      "word_id": 1701,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1703,
      "word_id": 1702,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1704,
      "word_id": 1703,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1705,
      "word_id": 1704,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1706,
      "word_id": 1705,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1707,
      "word_id": 1706,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1708,
      "word_id": 1707,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1709,
      "word_id": 1708,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1710,
      "word_id": 1709,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1711,
      "word_id": 1710,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1712,
      "word_id": 1711,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1713,
      "word_id": 1712,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1714,
      "word_id": 1713,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1715,
      "word_id": 1714,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1716,
      "word_id": 1715,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1717,
      "word_id": 1716,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1718,
      "word_id": 1717,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1719,
      "word_id": 1718,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1720,
      "word_id": 1719,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1721,
      "word_id": 1720,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1722,
      "word_id": 1721,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1723,
      "word_id": 1722,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1724,
      "word_id": 1723,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1725,
      "word_id": 1724,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1726,
      "word_id": 1725,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1727,
      "word_id": 1726,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1728,
      "word_id": 1727,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1729,
      "word_id": 1728,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1730,
      "word_id": 1729,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1731,
      "word_id": 1730,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1732,
      "word_id": 1731,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1733,
      "word_id": 1732,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1734,
      "word_id": 1733,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1735,
      "word_id": 1734,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1736,
      "word_id": 1735,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1737,
      "word_id": 1736,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1738,
      "word_id": 1737,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1739,
      "word_id": 1738,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1740,
      "word_id": 1739,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1741,
      "word_id": 1740,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1742,
      "word_id": 1741,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1743,
      "word_id": 1742,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1744,
      "word_id": 1743,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1745,
      "word_id": 1744,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1746,
      "word_id": 1745,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1747,
      "word_id": 1746,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1748,
      "word_id": 1747,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1749,
      "word_id": 1748,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1750,
      "word_id": 1749,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1751,
      "word_id": 1750,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1752,
      "word_id": 1751,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1753,
      "word_id": 1752,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1754,
      "word_id": 1753,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1755,
      "word_id": 1754,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1756,
      "word_id": 1755,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1757,
      "word_id": 1756,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1758,
      "word_id": 1757,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1759,
      "word_id": 1758,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1760,
      "word_id": 1759,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1761,
      "word_id": 1760,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1762,
      "word_id": 1761,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1763,
      "word_id": 1762,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1764,
      "word_id": 1763,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1765,
      "word_id": 1764,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1766,
      "word_id": 1765,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1767,
      "word_id": 1766,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1768,
      "word_id": 1767,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1769,
      "word_id": 1768,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1770,
      "word_id": 1769,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 1771,
      "word_id": 1770,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1772,
      "word_id": 1771,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1773,
      "word_id": 1772,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1774,
      "word_id": 1773,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1775,
      "word_id": 1774,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1776,
      "word_id": 1775,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1777,
      "word_id": 1776,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1778,
      "word_id": 1777,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1779,
      "word_id": 1778,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1780,
      "word_id": 1779,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1781,
      "word_id": 1780,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1782,
      "word_id": 1781,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1783,
      "word_id": 1782,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1784,
      "word_id": 1783,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1785,
      "word_id": 1784,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1786,
      "word_id": 1785,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1787,
      "word_id": 1786,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1788,
      "word_id": 1787,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1789,
      "word_id": 1788,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1790,
      "word_id": 1789,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1791,
      "word_id": 1790,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1792,
      "word_id": 1791,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1793,
      "word_id": 1792,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1794,
      "word_id": 1793,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1795,
      "word_id": 1794,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1796,
      "word_id": 1795,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1797,
      "word_id": 1796,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1798,
      "word_id": 1797,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1799,
      "word_id": 1798,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1800,
      "word_id": 1799,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1801,
      "word_id": 1800,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1802,
      "word_id": 1801,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1803,
      "word_id": 1802,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1804,
      "word_id": 1803,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1805,
      "word_id": 1804,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1806,
      "word_id": 1805,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1807,
      "word_id": 1806,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1808,
      "word_id": 1807,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1809,
      "word_id": 1808,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1810,
      "word_id": 1809,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1811,
      "word_id": 1810,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1812,
      "word_id": 1811,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1813,
      "word_id": 1812,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1814,
      "word_id": 1813,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1815,
      "word_id": 1814,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1816,
      "word_id": 1815,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1817,
      "word_id": 1816,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1818,
      "word_id": 1817,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1819,
      "word_id": 1818,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1820,
      "word_id": 1819,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1821,
      "word_id": 1820,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1822,
      "word_id": 1821,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1823,
      "word_id": 1822,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1824,
      "word_id": 1823,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1825,
      "word_id": 1824,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1826,
      "word_id": 1825,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1827,
      "word_id": 1826,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1828,
      "word_id": 1827,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1829,
      "word_id": 1828,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1830,
      "word_id": 1829,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1831,
      "word_id": 1830,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1832,
      "word_id": 1831,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1833,
      "word_id": 1832,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1834,
      "word_id": 1833,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1835,
      "word_id": 1834,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1836,
      "word_id": 1835,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1837,
      "word_id": 1836,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1838,
      "word_id": 1837,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1839,
      "word_id": 1838,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1840,
      "word_id": 1839,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1841,
      "word_id": 1840,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1842,
      "word_id": 1841,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1843,
      "word_id": 1842,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1844,
      "word_id": 1843,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1845,
      "word_id": 1844,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1846,
      "word_id": 1845,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1847,
      "word_id": 1846,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1848,
      "word_id": 1847,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1849,
      "word_id": 1848,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1850,
      "word_id": 1849,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1851,
      "word_id": 1850,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1852,
      "word_id": 1851,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1853,
      "word_id": 1852,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1854,
      "word_id": 1853,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1855,
      "word_id": 1854,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1856,
      "word_id": 1855,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1857,
      "word_id": 1856,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1858,
      "word_id": 1857,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1859,
      "word_id": 1858,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1860,
      "word_id": 1859,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1861,
      "word_id": 1860,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1862,
      "word_id": 1861,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1863,
      "word_id": 1862,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1864,
      "word_id": 1863,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1865,
      "word_id": 1864,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1866,
      "word_id": 1865,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1867,
      "word_id": 1866,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1868,
      "word_id": 1867,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1869,
      "word_id": 1868,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1870,
      "word_id": 1869,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1871,
      "word_id": 1870,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1872,
      "word_id": 1871,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1873,
      "word_id": 1872,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1874,
      "word_id": 1873,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1875,
      "word_id": 1874,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1876,
      "word_id": 1875,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1877,
      "word_id": 1876,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1878,
      "word_id": 1877,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1879,
      "word_id": 1878,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1880,
      "word_id": 1879,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1881,
      "word_id": 1880,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1882,
      "word_id": 1881,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1883,
      "word_id": 1882,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1884,
      "word_id": 1883,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1885,
      "word_id": 1884,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1886,
      "word_id": 1885,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1887,
      "word_id": 1886,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1888,
      "word_id": 1887,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1889,
      "word_id": 1888,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1890,
      "word_id": 1889,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1891,
      "word_id": 1890,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1892,
      "word_id": 1891,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1893,
      "word_id": 1892,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1894,
      "word_id": 1893,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1895,
      "word_id": 1894,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1896,
      "word_id": 1895,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1897,
      "word_id": 1896,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1898,
      "word_id": 1897,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1899,
      "word_id": 1898,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1900,
      "word_id": 1899,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1901,
      "word_id": 1900,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1902,
      "word_id": 1901,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1903,
      "word_id": 1902,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1904,
      "word_id": 1903,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1905,
      "word_id": 1904,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1906,
      "word_id": 1905,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1907,
      "word_id": 1906,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1908,
      "word_id": 1907,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1909,
      "word_id": 1908,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1910,
      "word_id": 1909,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1911,
      "word_id": 1910,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1912,
      "word_id": 1911,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1913,
      "word_id": 1912,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1914,
      "word_id": 1913,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1915,
      "word_id": 1914,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1916,
      "word_id": 1915,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1917,
      "word_id": 1916,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1918,
      "word_id": 1917,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1919,
      "word_id": 1918,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1920,
      "word_id": 1919,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1921,
      "word_id": 1920,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1922,
      "word_id": 1921,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1923,
      "word_id": 1922,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1924,
      "word_id": 1923,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1925,
      "word_id": 1924,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1926,
      "word_id": 1925,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1927,
      "word_id": 1926,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1928,
      "word_id": 1927,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1929,
      "word_id": 1928,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1930,
      "word_id": 1929,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1931,
      "word_id": 1930,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1932,
      "word_id": 1931,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1933,
      "word_id": 1932,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1934,
      "word_id": 1933,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1935,
      "word_id": 1934,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1936,
      "word_id": 1935,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1937,
      "word_id": 1936,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1938,
      "word_id": 1937,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1939,
      "word_id": 1938,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1940,
      "word_id": 1939,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1941,
      "word_id": 1940,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1942,
      "word_id": 1941,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1943,
      "word_id": 1942,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1944,
      "word_id": 1943,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1945,
      "word_id": 1944,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1946,
      "word_id": 1945,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1947,
      "word_id": 1946,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1948,
      "word_id": 1947,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1949,
      "word_id": 1948,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1950,
      "word_id": 1949,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1951,
      "word_id": 1950,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1952,
      "word_id": 1951,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1953,
      "word_id": 1952,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1954,
      "word_id": 1953,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1955,
      "word_id": 1954,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1956,
      "word_id": 1955,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1957,
      "word_id": 1956,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1958,
      "word_id": 1957,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1959,
      "word_id": 1958,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1960,
      "word_id": 1959,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1961,
      "word_id": 1960,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1962,
      "word_id": 1961,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1963,
      "word_id": 1962,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1964,
      "word_id": 1963,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1965,
      "word_id": 1964,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1966,
      "word_id": 1965,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1967,
      "word_id": 1966,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1968,
      "word_id": 1967,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1969,
      "word_id": 1968,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1970,
      "word_id": 1969,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1971,
      "word_id": 1970,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1972,
      "word_id": 1971,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1973,
      "word_id": 1972,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1974,
      "word_id": 1973,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1975,
      "word_id": 1974,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1976,
      "word_id": 1975,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1977,
      "word_id": 1976,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1978,
      "word_id": 1977,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1979,
      "word_id": 1978,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1980,
      "word_id": 1979,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1981,
      "word_id": 1980,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1982,
      "word_id": 1981,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1983,
      "word_id": 1982,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1984,
      "word_id": 1983,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1985,
      "word_id": 1984,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1986,
      "word_id": 1985,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1987,
      "word_id": 1986,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1988,
      "word_id": 1987,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1989,
      "word_id": 1988,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1990,
      "word_id": 1989,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1991,
      "word_id": 1990,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1992,
      "word_id": 1991,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1993,
      "word_id": 1992,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1994,
      "word_id": 1993,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1995,
      "word_id": 1994,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1996,
      "word_id": 1995,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1997,
      "word_id": 1996,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1998,
      "word_id": 1997,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 1999,
      "word_id": 1998,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2000,
      "word_id": 1999,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2001,
      "word_id": 2000,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2002,
      "word_id": 2001,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2003,
      "word_id": 2002,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2004,
      "word_id": 2003,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2005,
      "word_id": 2004,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2006,
      "word_id": 2005,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2007,
      "word_id": 2006,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2008,
      "word_id": 2007,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2009,
      "word_id": 2008,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2010,
      "word_id": 2009,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2011,
      "word_id": 2010,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2012,
      "word_id": 2011,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2013,
      "word_id": 2012,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2014,
      "word_id": 2013,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2015,
      "word_id": 2014,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2016,
      "word_id": 2015,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2017,
      "word_id": 2016,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2018,
      "word_id": 2017,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2019,
      "word_id": 2018,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2020,
      "word_id": 2019,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2021,
      "word_id": 2020,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2022,
      "word_id": 2021,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2023,
      "word_id": 2022,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2024,
      "word_id": 2023,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2025,
      "word_id": 2024,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2026,
      "word_id": 2025,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2027,
      "word_id": 2026,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2028,
      "word_id": 2027,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2029,
      "word_id": 2028,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2030,
      "word_id": 2029,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2031,
      "word_id": 2030,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2032,
      "word_id": 2031,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2033,
      "word_id": 2032,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2034,
      "word_id": 2033,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2035,
      "word_id": 2034,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2036,
      "word_id": 2035,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2037,
      "word_id": 2036,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2038,
      "word_id": 2037,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2039,
      "word_id": 2038,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2040,
      "word_id": 2039,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2041,
      "word_id": 2040,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2042,
      "word_id": 2041,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2043,
      "word_id": 2042,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2044,
      "word_id": 2043,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2045,
      "word_id": 2044,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2046,
      "word_id": 2045,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2047,
      "word_id": 2046,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2048,
      "word_id": 2047,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2049,
      "word_id": 2048,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2050,
      "word_id": 2049,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2051,
      "word_id": 2050,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2052,
      "word_id": 2051,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2053,
      "word_id": 2052,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2054,
      "word_id": 2053,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2055,
      "word_id": 2054,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2056,
      "word_id": 2055,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2057,
      "word_id": 2056,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2058,
      "word_id": 2057,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2059,
      "word_id": 2058,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2060,
      "word_id": 2059,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2061,
      "word_id": 2060,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2062,
      "word_id": 2061,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2063,
      "word_id": 2062,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2064,
      "word_id": 2063,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2065,
      "word_id": 2064,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2066,
      "word_id": 2065,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2067,
      "word_id": 2066,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2068,
      "word_id": 2067,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2069,
      "word_id": 2068,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2070,
      "word_id": 2069,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2071,
      "word_id": 2070,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2072,
      "word_id": 2071,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2073,
      "word_id": 2072,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2074,
      "word_id": 2073,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2075,
      "word_id": 2074,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2076,
      "word_id": 2075,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2077,
      "word_id": 2076,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2078,
      "word_id": 2077,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2079,
      "word_id": 2078,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2080,
      "word_id": 2079,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2081,
      "word_id": 2080,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2082,
      "word_id": 2081,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2083,
      "word_id": 2082,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2084,
      "word_id": 2083,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2085,
      "word_id": 2084,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2086,
      "word_id": 2085,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2087,
      "word_id": 2086,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2088,
      "word_id": 2087,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2089,
      "word_id": 2088,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2090,
      "word_id": 2089,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2091,
      "word_id": 2090,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2092,
      "word_id": 2091,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2093,
      "word_id": 2092,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2094,
      "word_id": 2093,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2095,
      "word_id": 2094,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2096,
      "word_id": 2095,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2097,
      "word_id": 2096,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2098,
      "word_id": 2097,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2099,
      "word_id": 2098,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2100,
      "word_id": 2099,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2101,
      "word_id": 2100,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2102,
      "word_id": 2101,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2103,
      "word_id": 2102,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2104,
      "word_id": 2103,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2105,
      "word_id": 2104,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2106,
      "word_id": 2105,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2107,
      "word_id": 2106,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2108,
      "word_id": 2107,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2109,
      "word_id": 2108,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2110,
      "word_id": 2109,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2111,
      "word_id": 2110,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2112,
      "word_id": 2111,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2113,
      "word_id": 2112,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2114,
      "word_id": 2113,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2115,
      "word_id": 2114,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2116,
      "word_id": 2115,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2117,
      "word_id": 2116,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2118,
      "word_id": 2117,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2119,
      "word_id": 2118,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2120,
      "word_id": 2119,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2121,
      "word_id": 2120,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2122,
      "word_id": 2121,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2123,
      "word_id": 2122,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2124,
      "word_id": 2123,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2125,
      "word_id": 2124,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2126,
      "word_id": 2125,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2127,
      "word_id": 2126,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2128,
      "word_id": 2127,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2129,
      "word_id": 2128,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2130,
      "word_id": 2129,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2131,
      "word_id": 2130,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2132,
      "word_id": 2131,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2133,
      "word_id": 2132,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2134,
      "word_id": 2133,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2135,
      "word_id": 2134,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2136,
      "word_id": 2135,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2137,
      "word_id": 2136,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2138,
      "word_id": 2137,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2139,
      "word_id": 2138,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2140,
      "word_id": 2139,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2141,
      "word_id": 2140,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2142,
      "word_id": 2141,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2143,
      "word_id": 2142,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2144,
      "word_id": 2143,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2145,
      "word_id": 2144,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2146,
      "word_id": 2145,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2147,
      "word_id": 2146,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2148,
      "word_id": 2147,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2149,
      "word_id": 2148,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2150,
      "word_id": 2149,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2151,
      "word_id": 2150,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2152,
      "word_id": 2151,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2153,
      "word_id": 2152,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2154,
      "word_id": 2153,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2155,
      "word_id": 2154,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2156,
      "word_id": 2155,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2157,
      "word_id": 2156,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2158,
      "word_id": 2157,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2159,
      "word_id": 2158,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2160,
      "word_id": 2159,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2161,
      "word_id": 2160,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2162,
      "word_id": 2161,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2163,
      "word_id": 2162,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2164,
      "word_id": 2163,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2165,
      "word_id": 2164,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2166,
      "word_id": 2165,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2167,
      "word_id": 2166,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2168,
      "word_id": 2167,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2169,
      "word_id": 2168,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2170,
      "word_id": 2169,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2171,
      "word_id": 2170,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2172,
      "word_id": 2171,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2173,
      "word_id": 2172,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2174,
      "word_id": 2173,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2175,
      "word_id": 2174,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2176,
      "word_id": 2175,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2177,
      "word_id": 2176,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2178,
      "word_id": 2177,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2179,
      "word_id": 2178,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2180,
      "word_id": 2179,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2181,
      "word_id": 2180,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2182,
      "word_id": 2181,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2183,
      "word_id": 2182,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2184,
      "word_id": 2183,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2185,
      "word_id": 2184,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2186,
      "word_id": 2185,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2187,
      "word_id": 2186,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2188,
      "word_id": 2187,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2189,
      "word_id": 2188,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2190,
      "word_id": 2189,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2191,
      "word_id": 2190,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2192,
      "word_id": 2191,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2193,
      "word_id": 2192,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2194,
      "word_id": 2193,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2195,
      "word_id": 2194,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2196,
      "word_id": 2195,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2197,
      "word_id": 2196,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2198,
      "word_id": 2197,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2199,
      "word_id": 2198,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2200,
      "word_id": 2199,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2201,
      "word_id": 2200,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2202,
      "word_id": 2201,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2203,
      "word_id": 2202,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2204,
      "word_id": 2203,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2205,
      "word_id": 2204,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2206,
      "word_id": 2205,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2207,
      "word_id": 2206,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2208,
      "word_id": 2207,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2209,
      "word_id": 2208,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2210,
      "word_id": 2209,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2211,
      "word_id": 2210,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2212,
      "word_id": 2211,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2213,
      "word_id": 2212,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2214,
      "word_id": 2213,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2215,
      "word_id": 2214,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2216,
      "word_id": 2215,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2217,
      "word_id": 2216,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2218,
      "word_id": 2217,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2219,
      "word_id": 2218,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2220,
      "word_id": 2219,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2221,
      "word_id": 2220,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2222,
      "word_id": 2221,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2223,
      "word_id": 2222,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2224,
      "word_id": 2223,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2225,
      "word_id": 2224,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2226,
      "word_id": 2225,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2227,
      "word_id": 2226,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2228,
      "word_id": 2227,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2229,
      "word_id": 2228,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2230,
      "word_id": 2229,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2231,
      "word_id": 2230,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2232,
      "word_id": 2231,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2233,
      "word_id": 2232,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2234,
      "word_id": 2233,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2235,
      "word_id": 2234,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2236,
      "word_id": 2235,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2237,
      "word_id": 2236,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2238,
      "word_id": 2237,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2239,
      "word_id": 2238,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2240,
      "word_id": 2239,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2241,
      "word_id": 2240,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2242,
      "word_id": 2241,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2243,
      "word_id": 2242,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2244,
      "word_id": 2243,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2245,
      "word_id": 2244,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2246,
      "word_id": 2245,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2247,
      "word_id": 2246,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2248,
      "word_id": 2247,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2249,
      "word_id": 2248,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2250,
      "word_id": 2249,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2251,
      "word_id": 2250,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2252,
      "word_id": 2251,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2253,
      "word_id": 2252,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2254,
      "word_id": 2253,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2255,
      "word_id": 2254,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2256,
      "word_id": 2255,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2257,
      "word_id": 2256,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2258,
      "word_id": 2257,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2259,
      "word_id": 2258,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2260,
      "word_id": 2259,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2261,
      "word_id": 2260,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2262,
      "word_id": 2261,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2263,
      "word_id": 2262,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2264,
      "word_id": 2263,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2265,
      "word_id": 2264,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2266,
      "word_id": 2265,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2267,
      "word_id": 2266,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2268,
      "word_id": 2267,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2269,
      "word_id": 2268,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2270,
      "word_id": 2269,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2271,
      "word_id": 2270,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2272,
      "word_id": 2271,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2273,
      "word_id": 2272,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2274,
      "word_id": 2273,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2275,
      "word_id": 2274,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2276,
      "word_id": 2275,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2277,
      "word_id": 2276,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2278,
      "word_id": 2277,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2279,
      "word_id": 2278,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2280,
      "word_id": 2279,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2281,
      "word_id": 2280,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2282,
      "word_id": 2281,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2283,
      "word_id": 2282,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2284,
      "word_id": 2283,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2285,
      "word_id": 2284,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2286,
      "word_id": 2285,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2287,
      "word_id": 2286,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2288,
      "word_id": 2287,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2289,
      "word_id": 2288,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2290,
      "word_id": 2289,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2291,
      "word_id": 2290,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2292,
      "word_id": 2291,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2293,
      "word_id": 2292,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2294,
      "word_id": 2293,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2295,
      "word_id": 2294,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2296,
      "word_id": 2295,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2297,
      "word_id": 2296,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2298,
      "word_id": 2297,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2299,
      "word_id": 2298,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2300,
      "word_id": 2299,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2301,
      "word_id": 2300,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2302,
      "word_id": 2301,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2303,
      "word_id": 2302,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2304,
      "word_id": 2303,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2305,
      "word_id": 2304,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2306,
      "word_id": 2305,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2307,
      "word_id": 2306,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2308,
      "word_id": 2307,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2309,
      "word_id": 2308,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2310,
      "word_id": 2309,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2311,
      "word_id": 2310,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2312,
      "word_id": 2311,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2313,
      "word_id": 2312,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2314,
      "word_id": 2313,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2315,
      "word_id": 2314,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2316,
      "word_id": 2315,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2317,
      "word_id": 2316,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2318,
      "word_id": 2317,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2319,
      "word_id": 2318,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2320,
      "word_id": 2319,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2321,
      "word_id": 2320,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2322,
      "word_id": 2321,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2323,
      "word_id": 2322,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2324,
      "word_id": 2323,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2325,
      "word_id": 2324,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2326,
      "word_id": 2325,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2327,
      "word_id": 2326,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2328,
      "word_id": 2327,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2329,
      "word_id": 2328,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2330,
      "word_id": 2329,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2331,
      "word_id": 2330,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2332,
      "word_id": 2331,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2333,
      "word_id": 2332,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2334,
      "word_id": 2333,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2335,
      "word_id": 2334,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2336,
      "word_id": 2335,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2337,
      "word_id": 2336,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2338,
      "word_id": 2337,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2339,
      "word_id": 2338,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2340,
      "word_id": 2339,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2341,
      "word_id": 2340,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2342,
      "word_id": 2341,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2343,
      "word_id": 2342,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2344,
      "word_id": 2343,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2345,
      "word_id": 2344,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2346,
      "word_id": 2345,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2347,
      "word_id": 2346,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2348,
      "word_id": 2347,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2349,
      "word_id": 2348,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2350,
      "word_id": 2349,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2351,
      "word_id": 2350,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2352,
      "word_id": 2351,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2353,
      "word_id": 2352,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2354,
      "word_id": 2353,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2355,
      "word_id": 2354,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2356,
      "word_id": 2355,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2357,
      "word_id": 2356,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2358,
      "word_id": 2357,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2359,
      "word_id": 2358,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2360,
      "word_id": 2359,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2361,
      "word_id": 2360,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2362,
      "word_id": 2361,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2363,
      "word_id": 2362,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2364,
      "word_id": 2363,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2365,
      "word_id": 2364,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2366,
      "word_id": 2365,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2367,
      "word_id": 2366,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2368,
      "word_id": 2367,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2369,
      "word_id": 2368,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2370,
      "word_id": 2369,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2371,
      "word_id": 2370,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2372,
      "word_id": 2371,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2373,
      "word_id": 2372,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2374,
      "word_id": 2373,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2375,
      "word_id": 2374,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2376,
      "word_id": 2375,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2377,
      "word_id": 2376,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2378,
      "word_id": 2377,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2379,
      "word_id": 2378,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2380,
      "word_id": 2379,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2381,
      "word_id": 2380,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2382,
      "word_id": 2381,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2383,
      "word_id": 2382,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2384,
      "word_id": 2383,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2385,
      "word_id": 2384,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2386,
      "word_id": 2385,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2387,
      "word_id": 2386,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2388,
      "word_id": 2387,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2389,
      "word_id": 2388,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2390,
      "word_id": 2389,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2391,
      "word_id": 2390,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2392,
      "word_id": 2391,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2393,
      "word_id": 2392,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2394,
      "word_id": 2393,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2395,
      "word_id": 2394,
      "review_status": "needs_review",
      "review_note": "元CSVの綴り・空白・欠落を原教材で確認してください。推測による訳は付けていません。"
    },
    {
      "number": 2396,
      "word_id": 2395,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2397,
      "word_id": 2396,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2398,
      "word_id": 2397,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2399,
      "word_id": 2398,
      "review_status": "unassessed",
      "review_note": null
    },
    {
      "number": 2400,
      "word_id": 2399,
      "review_status": "unassessed",
      "review_note": null
    }
  ],
  "translation_version": "2026-11-03",
  "translation_description": "一般的な意味に基づく独自の学習用訳。教材掲載訳の転載ではありません。"
};try{const saved=localStorage.getItem(key);if(saved)applySaved(JSON.parse(saved));}catch{$('save-status').textContent='保存データを読み込めません。元データを表示しています。';}for(const id of ['range','manage-range'])$(id).innerHTML=ranges.map((r,i)=>`<option value="${i}">${r.start}〜${r.end}</option>`).join('');generate();manager();}catch(e){$('error').textContent=e.message;}

$("questions").addEventListener("click",e=>{const button=e.target.closest("[data-reveal]");if(!button)return;const meaning=$(button.getAttribute("aria-controls"));meaning.hidden=!meaning.hidden;button.setAttribute("aria-expanded",String(!meaning.hidden));});

let cardDeck=[],cardOriginal=[],cardMissed=[],cardIndex=0,cardKnown=0;
function startCards(deck,keepOriginal=false){cardDeck=deck.slice();if(!keepOriginal)cardOriginal=deck.slice();cardMissed=[];cardIndex=0;cardKnown=0;$('flash').hidden=false;document.querySelector('.papers').hidden=true;document.querySelector('.tools').hidden=true;$('flash-save').textContent='';showCard();$('flash').scrollIntoView({behavior:'smooth',block:'start'});}
function closeCards(){$('flash').hidden=true;document.querySelector('.papers').hidden=false;document.querySelector('.tools').hidden=false;render();}
function showCard(){const done=cardIndex>=cardDeck.length;$('flash-active').hidden=done;$('flash-result').hidden=!done;$('flash-progress').textContent=`${Math.min(cardIndex+1,cardDeck.length)} / ${cardDeck.length}枚 ・ 覚えた ${cardKnown} ・ まだ ${cardMissed.length}`;if(done){$('flash-summary').textContent=`${cardDeck.length}枚完了！ 覚えた ${cardKnown}語、まだ ${cardMissed.length}語。`;$('flash-retry').hidden=!cardMissed.length;return;}const q=cardDeck[cardIndex],w=data.words.find(w=>w.id===q.word_id);$('flash-number').textContent=`単語番号 ${q.number}${q.review_status==='needs_review'?' ・ OCR要確認':''}`;$('flash-word').textContent=w.word;$('flash-meaning').textContent=w.meaning_ja||(w.meaning_source==='pending_spelling_review'?'要確認：綴りを確認してください':'訳未登録');$('flash-meaning').hidden=true;$('flash-card').setAttribute('aria-expanded','false');$('flash-hint').textContent='タップして訳を見る';$('flash-again').disabled=$('flash-known').disabled=true;}
$('flash-card').onclick=()=>{const show=$('flash-meaning').hidden;$('flash-meaning').hidden=!show;$('flash-card').setAttribute('aria-expanded',String(show));$('flash-hint').textContent=show?'タップして訳を隠す':'タップして訳を見る';$('flash-again').disabled=$('flash-known').disabled=false;};
function rateCard(known){if(cardIndex>=cardDeck.length)return;const q=cardDeck[cardIndex],w=data.words.find(w=>w.id===q.word_id);w.weak=!known;if(known)cardKnown++;else cardMissed.push(q);save();weakUI();$('flash-save').textContent=$('save-status').textContent;cardIndex++;showCard();}
$('flash-again').onclick=()=>rateCard(false);$('flash-known').onclick=()=>rateCard(true);$('flash-retry').onclick=()=>startCards(cardMissed,true);$('flash-restart').onclick=()=>startCards(cardOriginal,true);$('exit-cards').onclick=closeCards;
