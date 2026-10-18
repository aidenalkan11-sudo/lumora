import { GoogleGenAI, Modality } from "https://esm.sh/@google/genai";

const MODEL = "models/gemini-3.8-live";
const VOICES = {
  female: { name: "Kate", geminiVoice: "Aoede" },
  male: { name: "Steve", geminiVoice: "Fenrir" },
};
const UNLOCK_KEY = "mka-gemini-demo-unlock-v1";
const SHARED_KEY = "lumora-demo-pass";
const TZ = "Australia/Melbourne";
const $ = (id) => document.getElementById(id);
const screen = $("screen");
const els = {
  who: $("who"), timer: $("timer"), mode: $("mode"), captions: $("captions"),
  notice: $("notice"), call: $("call"), callLabel: $("call-label"), hang: $("hang"),
  mute: $("mute"), muteLabel: $("mute-label"), card: $("card"), cardRows: $("card-rows"),
  cardTitle: $("card-title"), wave: $("wave"), clock: $("clock"),
};
let voiceKey = "female", session = null, state = "idle", startedAt = 0, timerId = null;
let muted = false, attemptId = 0, lastUserLine = "", pendingBooking = null;
const heard = { agent: "", prevAgent: "", user: "" };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Retain the existing demo passcode gate. The encrypted payload is only used to validate
// the passcode; Gemini credentials are never stored in this browser code.
const SEALED = {"s":"P0Zi6PRr7warlpp8g6xYbQ==","i":"0yszRi9c0+3lX0V5","c":"w6QBhxrVr4BTv5KBhuAIXenP4jbS3W73bJ7hWG+3IzDQ/eN01ni1gRCKR3DRAeSa4y2hZoWrlcr9B7RQxKrFVDaw62kJajbG/mGdnjmf3JmJK2ZtueXVdLzzzdCburb7dlncBIzoSXkm6/8="};
async function validatePasscode(code) {
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(norm), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({name:"PBKDF2",salt:fromB64(SEALED.s),iterations:600000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["decrypt"]);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(SEALED.i)},key,fromB64(SEALED.c));
  const ids = JSON.parse(new TextDecoder().decode(plain));
  if (!ids || !/^agent_\\w+$/.test(ids.female) || !/^agent_\\w+$/.test(ids.male)) throw new Error("Invalid passcode");
}
function unlock() { screen.dataset.locked = "false"; try { localStorage.setItem(UNLOCK_KEY,"1"); } catch {} }
try { if (localStorage.getItem(UNLOCK_KEY) === "1" || localStorage.getItem(SHARED_KEY)) unlock(); } catch {}
const lockForm=$("lock-form"), codeInput=$("code"), lockErr=$("lock-err"), unlockBtn=$("unlock");
let failures=0;
lockForm.addEventListener("submit",async(e)=>{e.preventDefault();if(unlockBtn.disabled)return;unlockBtn.disabled=true;unlockBtn.textContent="Checking…";lockErr.textContent="";try{await validatePasscode(codeInput.value);try{localStorage.setItem(SHARED_KEY,codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,""));}catch{}unlock();}catch{failures++;codeInput.classList.remove("shake");void codeInput.offsetWidth;codeInput.classList.add("shake");lockErr.textContent="That passcode isn't right. Check it and try again.";await new Promise(r=>setTimeout(r,Math.min(8000,600*2**(failures-1))));}finally{unlockBtn.disabled=false;unlockBtn.textContent="Unlock";}});
if(screen.dataset.locked==="true")setTimeout(()=>codeInput.focus(),300);

try { const saved=localStorage.getItem("mka-gemini-voice");if(saved&&VOICES[saved])voiceKey=saved; } catch {}
const voiceButtons=[...document.querySelectorAll(".voice")];
function selectVoice(key){voiceKey=key;voiceButtons.forEach(b=>b.setAttribute("aria-checked",String(b.dataset.voice===key)));try{localStorage.setItem("mka-gemini-voice",key);}catch{}}
voiceButtons.forEach(b=>b.addEventListener("click",()=>state!=="live"&&state!=="connecting"&&selectVoice(b.dataset.voice)));selectVoice(voiceKey);

function melbourneParts(d=new Date()){const f=new Intl.DateTimeFormat("en-AU",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));const h24=Number(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",hour12:false}).format(d));return{...p,h24};}
function context(){const now=new Date(),p=melbourneParts(now),weekend=p.weekday==="Saturday"||p.weekday==="Sunday",dates=[];for(let i=0;i<15;i++){const q=melbourneParts(new Date(now.getTime()+i*86400000));dates.push(`${q.weekday} ${q.day} ${q.month}${i===0?" (today)":i===1?" (tomorrow)":""}`);}return{now_melbourne:`${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`,office_status:weekend?"closed (weekend)":"open",upcoming_dates:dates.join("; ")};}
function tickClock(){els.clock.textContent=new Intl.DateTimeFormat("en-AU",{hour:"numeric",minute:"2-digit",hour12:false}).format(new Date());}tickClock();setInterval(tickClock,15000);
function setState(next){state=next;screen.dataset.state=next;const name=VOICES[voiceKey].name;els.call.hidden=next==="live"||next==="connecting";els.hang.hidden=next!=="live"&&next!=="connecting";els.mute.hidden=next!=="live";els.call.classList.toggle("busy",next==="connecting");els.call.disabled=next==="connecting";if(next==="idle"){els.who.textContent="AI receptionist · Melbourne";els.callLabel.textContent="Call";}if(next==="connecting")els.who.textContent=`Calling ${name}…`;if(next==="live")els.who.textContent=`${name} · AI receptionist`;if(next==="ended"){els.who.textContent="Call ended";els.callLabel.textContent="Call again";}}
function setMode(m){els.mode.textContent=m==="speaking"?`${VOICES[voiceKey].name} is speaking`:"Listening…";els.mode.classList.toggle("speaking",m==="speaking");}
const clean=t=>String(t||"").replace(/\\[[^\\]]*\\]/g,"").replace(/\\s{2,}/g," ").trim();
function showCaption(role,text){const t=clean(text);if(!t)return;if(role==="user"){lastUserLine=t;return;}els.captions.innerHTML="";if(lastUserLine){const you=document.createElement("p");you.className="you line";you.textContent=`“${lastUserLine}”`;els.captions.appendChild(you);lastUserLine="";}const line=document.createElement("p");line.className="line";line.textContent=t;els.captions.appendChild(line);}
const PLACEHOLDER=/^(|to be confirmed|tbc|tbd|unknown|n\\/?a|none|pending)$/i;
function renderBooking(p,urgent=false){const rows=[["Name",p.customer_name],["Mobile",p.phone],["Job",p.job],["Where",p.suburb],["When",p.preferred_time]].filter(([,v])=>v&&!PLACEHOLDER.test(String(v).trim()));els.cardRows.innerHTML="";for(const[k,v]of rows){const dt=document.createElement("dt");dt.textContent=k;const dd=document.createElement("dd");dd.textContent=String(v);els.cardRows.append(dt,dd);}els.card.classList.toggle("urgent",urgent);els.cardTitle.textContent=urgent?"Flagged for Mohammed to call back":"Booking request sent to Mohammed";els.card.classList.add("show");els.captions.style.opacity="0";}
function hideBooking(){els.card.classList.remove("show");els.captions.style.opacity="";}
function pcm16ToBase64(float32){const bytes=new Uint8Array(float32.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<float32.length;i++){const s=Math.max(-1,Math.min(1,float32[i]));view.setInt16(i*2,s<0?s*0x8000:s*0x7fff,true);}let bin="";for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
function base64ToBytes(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
let micStream=null,inputCtx=null,processor=null,source=null,outputCtx=null,nextPlayAt=0;
function stopAudio(){try{processor?.disconnect();source?.disconnect();}catch{}processor=null;source=null;if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}try{inputCtx?.close();}catch{}inputCtx=null;try{outputCtx?.close();}catch{}outputCtx=null;nextPlayAt=0;}
function playPcm(data){if(!outputCtx||!data)return;const bytes=base64ToBytes(data);const samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));const buffer=outputCtx.createBuffer(1,samples.length,24000);const channel=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;const node=outputCtx.createBufferSource();node.buffer=buffer;node.connect(outputCtx.destination);nextPlayAt=Math.max(nextPlayAt,outputCtx.currentTime+0.02);node.start(nextPlayAt);nextPlayAt+=buffer.duration;setMode("speaking");node.onended=()=>{if(outputCtx&&outputCtx.currentTime>=nextPlayAt-0.05)setMode("listening");};}
async function getToken(){const r=await fetch("/api/demo/gemini-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:"mka-electrical"})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||"Couldn't securely start the Gemini session.");if(!body.token)throw new Error("The server didn't return a session token.");return body.token;}
async function startCall(){if(state==="connecting"||state==="live")return;const id=++attemptId;els.notice.textContent="";els.captions.innerHTML="";lastUserLine="";heard.agent=heard.prevAgent=heard.user="";pendingBooking=null;hideBooking();setState("connecting");let ws=null;
try{
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const token=await getToken();if(id!==attemptId){stopAudio();return;}
  inputCtx=new AudioContext({sampleRate:16000});outputCtx=new AudioContext({sampleRate:24000});await inputCtx.resume();await outputCtx.resume();source=inputCtx.createMediaStreamSource(micStream);processor=inputCtx.createScriptProcessor(4096,1,1);source.connect(processor);processor.connect(inputCtx.destination);
  const ai=new GoogleGenAI({apiKey:token});const config={responseModalities:[Modality.AUDIO],systemInstruction:{parts:[{text:`You are ${VOICES[voiceKey].name}, a friendly and professional AI receptionist for MKA Electrical in Melbourne, Australia. Speak naturally in Australian English with a clear Australian accent. Keep replies concise. Collect the caller's name, mobile number, job details, suburb/address, and preferred time. Never claim a booking is confirmed; say you will pass on a request for Mohammed to follow up. Use Melbourne local date and time context: ${JSON.stringify(context())}. If urgent, collect name, phone and suburb, then tell the caller you will flag it for a callback. Do not invent availability, prices, or confirmed appointments.`} ]},speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:VOICES[voiceKey].geminiVoice}}},inputAudioTranscription:{},outputAudioTranscription:{},tools:[{functionDeclarations:[{name:"show_booking_summary",description:"Display a booking request summary only after collecting the details and reading them back for caller confirmation. Never claim that an appointment is confirmed.",parameters:{type:"OBJECT",properties:{customer_name:{type:"STRING"},phone:{type:"STRING"},job:{type:"STRING"},suburb:{type:"STRING"},preferred_time:{type:"STRING"},urgent:{type:"BOOLEAN"}},required:["customer_name","phone","suburb"]}}]}]};
  session=await ai.live.connect({model:MODEL,config,callbacks:{
    onopen:()=>{if(id===attemptId){startedAt=Date.now();setState("live");setMode("listening");els.timer.textContent="00:00";clearInterval(timerId);timerId=setInterval(()=>{els.timer.textContent=String(Math.floor((Date.now()-startedAt)/60000)).padStart(2,"0")+":"+String(Math.floor((Date.now()-startedAt)/1000)%60).padStart(2,"0");},250);}},
    onmessage:async(message)=>{if(id!==attemptId)return;const sc=message.serverContent||{};if(sc.inputTranscription?.text){heard.user=clean(sc.inputTranscription.text);showCaption("user",heard.user);}if(sc.outputTranscription?.text){heard.prevAgent=heard.agent;heard.agent=clean(sc.outputTranscription.text);showCaption("agent",heard.agent);}for(const part of sc.modelTurn?.parts||[]){if(part.inlineData?.mimeType?.startsWith("audio/pcm"))playPcm(part.inlineData.data);}if(message.toolCall?.functionCalls?.length){const functionResponses=[];for(const call of message.toolCall.functionCalls){let result="Collected details; read the complete summary back and ask the caller to confirm before showing it.";if(call.name==="show_booking_summary"){const p=call.args||{};const urgent=p.urgent===true||p.urgent==="true";if([p.customer_name,p.phone,p.suburb].some(v=>PLACEHOLDER.test(String(v||"").trim()))){result="Missing required details. Collect the caller's name, phone and suburb first.";}else{renderBooking(p,urgent);result="Summary displayed. Do not say an appointment is confirmed; explain that Mohammed will follow up."}}functionResponses.push({id:call.id,name:call.name,response:{result}});}session?.sendToolResponse({functionResponses});}if(sc.turnComplete)setMode("listening");},
    onerror:(e)=>console.error("[Gemini Live]",e),
    onclose:()=>{if(id===attemptId&&state==="live")finishCall("The call ended. Tap Call again to reconnect.");}
  });
  processor.onaudioprocess=(event)=>{if(!session||muted||id!==attemptId)return;const input=event.inputBuffer.getChannelData(0);session.sendRealtimeInput({audio:{data:pcm16ToBase64(input),mimeType:"audio/pcm;rate=16000"}});};
}catch(e){console.error("[Gemini demo]",e);if(id===attemptId){finishCall(e?.message?.includes("GEMINI_API_KEY")?"Gemini isn't configured yet. Add GEMINI_API_KEY in Vercel project settings.":e?.message||"Couldn't connect. Check the microphone and try again.");if(state==="ended")setState("idle");}}}
function finishCall(message=""){attemptId++;const s=session;session=null;try{s?.close();}catch{}stopAudio();clearInterval(timerId);startedAt=0;setState("ended");els.notice.textContent=message;muted=false;els.mute.setAttribute("aria-pressed","false");els.muteLabel.textContent="Mute";}
els.call.addEventListener("click",startCall);els.hang.addEventListener("click",()=>finishCall());els.mute.addEventListener("click",()=>{muted=!muted;els.mute.setAttribute("aria-pressed",String(muted));els.muteLabel.textContent=muted?"Unmute":"Mute";});
document.addEventListener("keydown",e=>{if(e.code!=="Space"||e.repeat||screen.dataset.locked==="true")return;e.preventDefault();if(state==="live"||state==="connecting")finishCall();else startCall();});
window.addEventListener("pagehide",()=>{try{session?.close();}catch{}stopAudio();});setState("idle");
