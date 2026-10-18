const MODEL = "models/gemini-3.8-live";
const VOICES = {
  female: { name: "Kate", geminiVoice: "Aoede" },
  male: { name: "Steve", geminiVoice: "Fenrir" },
};
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
try { const saved=localStorage.getItem("mka-gemini-voice");if(saved&&VOICES[saved])voiceKey=saved; } catch {}
const voiceButtons=[...document.querySelectorAll(".voice")];
function selectVoice(key){voiceKey=key;voiceButtons.forEach(b=>b.setAttribute("aria-checked",String(b.dataset.voice===key)));try{localStorage.setItem("mka-gemini-voice",key);}catch{}}
voiceButtons.forEach(b=>b.addEventListener("click",()=>state!=="live"&&state!=="connecting"&&selectVoice(b.dataset.voice)));selectVoice(voiceKey);

function melbourneParts(d=new Date()){const f=new Intl.DateTimeFormat("en-AU",{timeZone:TZ,weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit",hour12:true});const p=Object.fromEntries(f.formatToParts(d).map(x=>[x.type,x.value]));const h24=Number(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",hour12:false}).format(d));return{...p,h24};}
function context(){const now=new Date(),p=melbourneParts(now),weekend=p.weekday==="Saturday"||p.weekday==="Sunday",dates=[];for(let i=0;i<15;i++){const q=melbourneParts(new Date(now.getTime()+i*86400000));dates.push(`${q.weekday} ${q.day} ${q.month}${i===0?" (today)":i===1?" (tomorrow)":""}`);}return{now_melbourne:`${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`,office_status:weekend?"closed (weekend)":"open",upcoming_dates:dates.join("; ")};}
function tickClock(){els.clock.textContent=new Intl.DateTimeFormat("en-AU",{hour:"numeric",minute:"2-digit",hour12:false}).format(new Date());}tickClock();setInterval(tickClock,15000);
function setState(next){state=next;screen.dataset.state=next;const name=VOICES[voiceKey].name;els.call.hidden=next==="live"||next==="connecting";els.hang.hidden=next!=="live"&&next!=="connecting";els.mute.hidden=next!=="live";els.call.classList.toggle("busy",next==="connecting");els.call.disabled=next==="connecting";if(next==="idle"){els.who.textContent="AI receptionist · Melbourne";els.callLabel.textContent="Call";}if(next==="connecting")els.who.textContent=`Calling ${name}…`;if(next==="live")els.who.textContent=`${name} · AI receptionist`;if(next==="ended"){els.who.textContent="Call ended";els.callLabel.textContent="Call again";}}
function setMode(m){els.mode.textContent=m==="speaking"?`${VOICES[voiceKey].name} is speaking`:"Listening…";els.mode.classList.toggle("speaking",m==="speaking");}
const clean=t=>String(t||"").replace(/\[[^\]]*\]/g,"").replace(/\s{2,}/g," ").trim();
function showCaption(role,text){const t=clean(text);if(!t)return;if(role==="user"){lastUserLine=t;return;}els.captions.innerHTML="";if(lastUserLine){const you=document.createElement("p");you.className="you line";you.textContent=`“${lastUserLine}”`;els.captions.appendChild(you);lastUserLine="";}const line=document.createElement("p");line.className="line";line.textContent=t;els.captions.appendChild(line);}
const PLACEHOLDER=/^(|to be confirmed|tbc|tbd|unknown|n\/?a|none|pending)$/i;
function renderBooking(p,urgent=false){const rows=[["Name",p.customer_name],["Mobile",p.phone],["Job",p.job],["Where",p.suburb],["When",p.preferred_time]].filter(([,v])=>v&&!PLACEHOLDER.test(String(v).trim()));els.cardRows.innerHTML="";for(const[k,v]of rows){const dt=document.createElement("dt");dt.textContent=k;const dd=document.createElement("dd");dd.textContent=String(v);els.cardRows.append(dt,dd);}els.card.classList.toggle("urgent",urgent);els.cardTitle.textContent=urgent?"Flagged for Mohammed to call back":"Booking request sent to Mohammed";els.card.classList.add("show");els.captions.style.opacity="0";}
function hideBooking(){els.card.classList.remove("show");els.captions.style.opacity="";}
function pcm16ToBase64(float32){const bytes=new Uint8Array(float32.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<float32.length;i++){const s=Math.max(-1,Math.min(1,float32[i]));view.setInt16(i*2,s<0?s*0x8000:s*0x7fff,true);}let bin="";for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);}
function base64ToBytes(s){const bin=atob(s),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
let micStream=null,inputCtx=null,processor=null,source=null,silentGain=null,outputCtx=null,nextPlayAt=0;
function stopAudio(){try{processor?.disconnect();source?.disconnect();silentGain?.disconnect();}catch{}processor=null;source=null;silentGain=null;if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;}try{inputCtx?.close();}catch{}inputCtx=null;try{outputCtx?.close();}catch{}outputCtx=null;nextPlayAt=0;}
function playPcm(data){if(!outputCtx||!data)return;const bytes=base64ToBytes(data);const samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));const buffer=outputCtx.createBuffer(1,samples.length,24000);const channel=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;const node=outputCtx.createBufferSource();node.buffer=buffer;node.connect(outputCtx.destination);nextPlayAt=Math.max(nextPlayAt,outputCtx.currentTime+0.02);node.start(nextPlayAt);nextPlayAt+=buffer.duration;setMode("speaking");node.onended=()=>{if(outputCtx&&outputCtx.currentTime>=nextPlayAt-0.05)setMode("listening");};}
async function getToken(voice){const r=await fetch("/api/demo/gemini-token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({demo:"mka-electrical",voice})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||"Couldn't securely start the Gemini session.");if(!body.token)throw new Error("The server didn't return a session token.");return body.token;}
async function startCall(){if(state==="connecting"||state==="live")return;const id=++attemptId;els.notice.textContent="";els.captions.innerHTML="";lastUserLine="";heard.agent=heard.prevAgent=heard.user="";pendingBooking=null;hideBooking();setState("connecting");let ws=null;
try{
  els.notice.textContent="Waiting for microphone permission…";
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Microphone access is unavailable in this browser. Open the demo in a current browser over HTTPS.");
  micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  els.notice.textContent="Microphone ready. Starting secure Gemini session…";
  const token=await getToken(voiceKey);if(id!==attemptId){stopAudio();return;}
  const { GoogleGenAI } = await import("https://esm.sh/@google/genai");
  inputCtx=new AudioContext({sampleRate:16000});outputCtx=new AudioContext({sampleRate:24000});await inputCtx.resume();await outputCtx.resume();source=inputCtx.createMediaStreamSource(micStream);processor=inputCtx.createScriptProcessor(4096,1,1);silentGain=inputCtx.createGain();silentGain.gain.value=0;source.connect(processor);processor.connect(silentGain);silentGain.connect(inputCtx.destination);
  const ai=new GoogleGenAI({apiKey:token,httpOptions:{apiVersion:"v1alpha"}});const config={responseModalities:["AUDIO"],inputAudioTranscription:{},outputAudioTranscription:{},tools:[{functionDeclarations:[{name:"show_booking_summary",description:"Display a booking request summary only after collecting the details and reading them back for caller confirmation. Never claim that an appointment is confirmed.",parameters:{type:"OBJECT",properties:{customer_name:{type:"STRING"},phone:{type:"STRING"},job:{type:"STRING"},suburb:{type:"STRING"},preferred_time:{type:"STRING"},urgent:{type:"BOOLEAN"}},required:["customer_name","phone","suburb"]}}]}]};
  session=await ai.live.connect({model:MODEL,config,callbacks:{
    onopen:()=>{if(id===attemptId){startedAt=Date.now();setState("live");setMode("listening");els.timer.textContent="00:00";clearInterval(timerId);timerId=setInterval(()=>{els.timer.textContent=String(Math.floor((Date.now()-startedAt)/60000)).padStart(2,"0")+":"+String(Math.floor((Date.now()-startedAt)/1000)%60).padStart(2,"0");},250);}},
    onmessage:async(message)=>{if(id!==attemptId)return;const sc=message.serverContent||{};if(sc.inputTranscription?.text){heard.user=clean(sc.inputTranscription.text);showCaption("user",heard.user);}if(sc.outputTranscription?.text){heard.prevAgent=heard.agent;heard.agent=clean(sc.outputTranscription.text);showCaption("agent",heard.agent);}for(const part of sc.modelTurn?.parts||[]){if(part.inlineData?.mimeType?.startsWith("audio/pcm"))playPcm(part.inlineData.data);}if(message.toolCall?.functionCalls?.length){const functionResponses=[];for(const call of message.toolCall.functionCalls){let result="Collected details; read the complete summary back and ask the caller to confirm before showing it.";if(call.name==="show_booking_summary"){const p=call.args||{};const urgent=p.urgent===true||p.urgent==="true";if([p.customer_name,p.phone,p.suburb].some(v=>PLACEHOLDER.test(String(v||"").trim()))){result="Missing required details. Collect the caller's name, phone and suburb first.";}else{renderBooking(p,urgent);result="Summary displayed. Do not say an appointment is confirmed; explain that Mohammed will follow up."}}functionResponses.push({id:call.id,name:call.name,response:{result}});}session?.sendToolResponse({functionResponses});}if(sc.turnComplete)setMode("listening");},
    onerror:(e)=>{console.error("[Gemini Live]",e);if(id===attemptId)finishCall("Gemini connection failed. Check the API key, Live API access, and browser connection, then try again.");},
    onclose:()=>{if(id===attemptId&&(state==="live"||state==="connecting"))finishCall("Gemini closed the connection. Check Live API access and try again.");}
  });
  processor.onaudioprocess=(event)=>{if(!session||muted||id!==attemptId)return;const input=event.inputBuffer.getChannelData(0);session.sendRealtimeInput({audio:{data:pcm16ToBase64(input),mimeType:"audio/pcm;rate=16000"}});};
}catch(e){console.error("[Gemini demo]",e);if(id===attemptId){finishCall(e?.message?.includes("GEMINI_API_KEY")?"Gemini isn't configured yet. Add GEMINI_API_KEY in Vercel project settings.":e?.message||"Couldn't connect. Check the microphone and try again.");if(state==="ended")setState("idle");}}}
function finishCall(message=""){attemptId++;const s=session;session=null;try{s?.close();}catch{}stopAudio();clearInterval(timerId);startedAt=0;setState("ended");els.notice.textContent=message;muted=false;els.mute.setAttribute("aria-pressed","false");els.muteLabel.textContent="Mute";}
els.call.addEventListener("click",startCall);els.hang.addEventListener("click",()=>finishCall());els.mute.addEventListener("click",()=>{muted=!muted;els.mute.setAttribute("aria-pressed",String(muted));els.muteLabel.textContent=muted?"Unmute":"Mute";});
document.addEventListener("keydown",e=>{if(e.code!=="Space"||e.repeat)return;e.preventDefault();if(state==="live"||state==="connecting")finishCall();else startCall();});
window.addEventListener("pagehide",()=>{try{session?.close();}catch{}stopAudio();});setState("idle");
