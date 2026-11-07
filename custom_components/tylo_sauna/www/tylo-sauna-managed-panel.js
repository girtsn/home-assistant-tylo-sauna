/* Tylo Sauna integration-managed Home Assistant sidebar.
 * TadoX-style shared calendar, Recorder statistics, and existing HA services.
 * No control commands bypass the climate entity's safety checks.
 */
const SA_ASSET_VERSION=new URL(import.meta.url).searchParams.get("v")||"0.5.0";
const {tsPresetRange}=await import("./tylo-sauna-date-range-picker.js?v="+encodeURIComponent(SA_ASSET_VERSION));
const SA_KEYS=new Set(["climate","light","stop_time","time_to_off","favorite",
  "temperature","temperature_setpoint","humidity","humidity_setpoint",
  "online","fault_code","fault_message","programs","heating_active","standby_active"]);
const SA_CHARTS=[
  {key:"temperature",title:"Temperature and sessions",unit:"°C",keys:["temperature","temperature_setpoint"],
    names:["Actual","Target"],colors:["#e57347","#edb95e"]},
  {key:"humidity",title:"Relative humidity",unit:"%",keys:["humidity","humidity_setpoint"],
    names:["Actual","Target"],colors:["#168f91","#a080c5"]},
  {key:"time_to_off",title:"Time remaining",unit:"min",keys:["time_to_off"],
    names:["Countdown"],colors:["#5083bb"]}
];
class TyloSaunaManagedPanel extends HTMLElement{
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this._hass=null;this._ready=false;this._loading=false;
    this._devices=[];this._range=tsPresetRange("last7");
    this._chartResults={};this._errors={};this._busy=new Set();this._notice="";
    this._request=0;this._chartRefresh=0;this._versionTimer=null;
  }
  set hass(value){
    this._hass=value;
    if(value&&!this._ready&&!this._loading&&this.isConnected)this._discover();
    if(this._ready){
      this._updateLive();
      if(Date.now()-this._chartRefresh>15*60*1000&&!this._busy.size)this._loadHistory();
    }
  }
  set panel(value){this._panel=value;}
  set narrow(value){this._narrow=!!value;}
  set route(value){this._route=value;}
  connectedCallback(){
    if(this._hass&&!this._ready&&!this._loading)this._discover();
    if(!this._versionTimer){
      this._checkVersion();
      this._versionTimer=window.setInterval(()=>this._checkVersion(),120000);
    }
  }
  disconnectedCallback(){
    if(this._versionTimer){window.clearInterval(this._versionTimer);this._versionTimer=null;}
  }
  async _checkVersion(){
    if(!this.isConnected||this._busy.size)return;
    try{
      const response=await fetch("/tylo_sauna/manifest.json?check="+Date.now(),{cache:"no-store"});
      if(!response.ok)return;
      const v=(await response.json()).version;
      if(!v||v===SA_ASSET_VERSION)return;
      const key="tylo-panel-reload-"+v;
      if(window.sessionStorage.getItem(key)!=="1"){
        window.sessionStorage.setItem(key,"1");window.location.reload();return;
      }
      this._announce("Dashboard "+v+" installed. Reopen this tab if the previous panel is still shown.");
    }catch(_err){/* HA may be restarting or browser storage unavailable */}
  }
  _el(tag,text,cls){
    const el=document.createElement(tag);
    if(text!==undefined&&text!==null)el.textContent=String(text);
    if(cls)el.className=cls;
    return el;
  }
  _btn(label,fn,cls){
    const el=this._el("button",label,cls||"");
    el.type="button";el.addEventListener("click",fn);return el;
  }
  _row(label,value){
    const r=this._el("div",null,"detail-row");
    r.append(this._el("span",label),this._el("strong",value??"—"));return r;
  }
  _value(dev,key){const id=dev.entities[key];return id?this._hass?.states?.[id]:null;}
  _display(dev,key){
    const s=this._value(dev,key);
    if(!s||["unknown","unavailable","none"].includes(String(s.state).toLowerCase()))return "—";
    return s.state;
  }
  _num(dev,key,unit=""){
    const raw=this._display(dev,key),n=Number(raw);
    return raw==="—"||!Number.isFinite(n)?"—":n.toLocaleString(undefined,{maximumFractionDigits:1})+(unit?" "+unit:"");
  }
  _announce(message){
    this._notice=message;
    const n=this.shadowRoot?.querySelector("[data-notice]");
    if(n)n.textContent=message;
  }
  async _discover(){
    if(this._loading||!this._hass)return;
    this._loading=true;
    try{
      const [devices,entities]=await Promise.all([
        this._hass.callWS({type:"config/device_registry/list"}),
        this._hass.callWS({type:"config/entity_registry/list"})
      ]);
      this._devices=(devices||[]).filter(d=>
        (d.identifiers||[]).some(id=>Array.isArray(id)&&id[0]==="tylo_sauna")
      ).map(d=>{
        const eid=(d.identifiers||[]).find(id=>Array.isArray(id)&&id[0]==="tylo_sauna")?.[1];
        const prefix="tylo_sauna_"+eid+"_";
        const found={};
        for(const e of (entities||[])){
          if(e.platform!=="tylo_sauna"||e.device_id!==d.id)continue;
          const uid=String(e.unique_id||"");
          const key=uid.startsWith(prefix)?uid.slice(prefix.length):null;
          if(SA_KEYS.has(key)&&e.entity_id)found[key]=e.entity_id;
        }
        return {id:d.id,name:d.name_by_user||d.name||"Tylo Sauna",entities:found};
      }).sort((a,b)=>a.name.localeCompare(b.name));
      this._ready=true;this._render();
      this._loadHistory();
    }catch(err){
      this._announce("Unable to load sauna devices: "+(err?.message||String(err)));
      this._render();
    }finally{this._loading=false;}
  }
  _css(){
    return [
      ":host{display:block;box-sizing:border-box;color:var(--primary-text-color);font:inherit}",
      "*{box-sizing:border-box}.shell{max-width:1400px;margin:0 auto;padding:16px 20px 36px}",
      "header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px}",
      "h1{font-size:25px;font-weight:650;margin:0}h2{font-size:18px;margin:0 0 13px;font-weight:600}",
      "h3{font-size:15px;margin:15px 0 10px;font-weight:600}",
      ".subtle{font-size:12px;color:var(--secondary-text-color,#777);line-height:1.6}",
      ".notice{font-size:13px;min-height:22px;margin:10px 0;color:var(--secondary-text-color,#777)}",
      ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,410px),1fr));gap:16px}",
      ".card{background:var(--card-background-color,var(--ha-card-background,#fff));padding:18px;border-radius:13px;border:1px solid var(--divider-color,#ddd);min-width:0}",
      ".status{display:flex;justify-content:space-between;align-items:center;gap:12px}",
      ".status strong{font-size:18px}.tag{font-size:12px;border-radius:20px;padding:5px 9px;background:var(--secondary-background-color,#eee)}",
      ".tag.on{color:var(--success-color,#128366)}.tag.off{color:var(--error-color,#cb4141)}",
      ".metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin:16px 0}",
      ".metric{background:var(--secondary-background-color,#f5f5f5);border-radius:9px;padding:12px}",
      ".metric small{display:block;font-size:12px;color:var(--secondary-text-color,#777);margin-bottom:5px}",
      ".metric strong{font-size:21px;font-weight:650}",
      ".action-row{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:9px 0}",
      "button,input,select{font:inherit;color:inherit}",
      "button{padding:9px 12px;border-radius:9px;border:1px solid var(--divider-color,#ccc);background:var(--card-background-color,#fff);cursor:pointer}",
      "button:hover{border-color:var(--primary-color,#268bd2)}",
      "button:disabled{opacity:.45;cursor:not-allowed}",
      "button.primary{background:var(--primary-color,#268bd2);color:#fff;border-color:transparent}",
      "button.danger{color:var(--error-color,#bc4545)}",
      "input,select{background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ccc);border-radius:8px;padding:8px 9px;max-width:180px;min-width:0}",
      "label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--secondary-text-color,#777)}",
      "label input,label select{color:var(--primary-text-color)}",
      ".detail-row{display:flex;justify-content:space-between;gap:14px;font-size:12px;padding:6px 0;border-bottom:1px solid var(--divider-color,#ddd)}",
      ".detail-row span{color:var(--secondary-text-color,#777)}.detail-row strong{font-weight:500;text-align:right;overflow-wrap:anywhere}",
      ".charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:16px;margin-top:16px}",
      ".plot{min-height:190px}.plot svg{width:100%;max-height:295px;display:block}",
      ".legend{display:flex;gap:9px;flex-wrap:wrap;font-size:12px;margin:0 0 6px}",
      ".legend span{display:flex;align-items:center;gap:5px}.swatch{width:16px;height:3px;border-radius:3px}",
      ".session-band{margin-top:12px;padding-top:9px;border-top:1px solid var(--divider-color,#ddd)}",
      ".session-band svg{width:100%;height:auto;display:block;overflow:visible}",
      ".date{margin:14px 0}.picker-heading{font-size:13px;margin:0 0 9px;color:var(--secondary-text-color,#777)}",
      ".foot{margin-top:16px}",
      "@media(max-width:650px){.shell{padding:12px}.card{padding:14px}.event{display:block}.event time{display:block;margin-bottom:3px}}"
    ].join("\n");
  }
  _run(dev,domain,service,key,fields,verb,description){
    const entity=dev.entities[key];
    if(!entity||this._busy.has(dev.id))return;
    if(!window.confirm(dev.name+"\n\n"+verb+"\n"+description+"\n\nContinue?"))return;
    this._busy.add(dev.id);this._updateLive();
    this._announce(verb+" requested for "+dev.name+"…");
    this._hass.callService(domain,service,fields,{entity_id:entity}).then(()=>{
      this._announce(verb+" request accepted by Home Assistant. Verify the sauna state.");
    }).catch(err=>{
      this._announce(verb+" failed: "+(err?.message||String(err)));
    }).finally(()=>{this._busy.delete(dev.id);this._updateLive();});
  }
  _buttonAction(dev,text,domain,service,key,fields,description,style=""){
    const b=this._btn(text,()=>this._run(dev,domain,service,key,fields,text,description),style);
    b.dataset.deviceAction=dev.id;b.dataset.entity=dev.entities[key]||"";
    return b;
  }
  _deviceCard(dev){
    const card=this._el("section",null,"card");
    const head=this._el("div",null,"status");
    head.append(this._el("strong",dev.name));
    const online=this._el("span","Checking…","tag");online.dataset.status=dev.id;head.append(online);
    card.append(head);
    const metrics=this._el("div",null,"metrics");
    for(const [key,title,unit] of [
      ["temperature","Current temperature","°C"],["temperature_setpoint","Target temperature","°C"],
      ["humidity","Humidity","%"],["time_to_off","Time to off","min"]
    ]){
      const metric=this._el("div",null,"metric");
      metric.append(this._el("small",title));
      const value=this._el("strong","—");value.dataset.live=dev.id+"|"+key+"|"+unit;
      metric.append(value);metrics.append(metric);
    }
    card.append(metrics);
    const mode=this._el("p",null,"subtle");
    mode.append(this._el("span","Mode: "));
    const modeValue=this._el("strong","—");modeValue.dataset.mode=dev.id;mode.append(modeValue);
    card.append(mode);
    card.append(this._el("h3","Sauna controls"));
    const acts=this._el("div",null,"action-row");
    acts.append(this._buttonAction(dev,"Start heating","climate","set_hvac_mode","climate",
      {hvac_mode:"heat"},"Starts heating. Check the door is closed and the sauna is clear.","primary"));
    if((this._value(dev,"climate")?.attributes?.hvac_modes||[]).includes("heat_cool"))
      acts.append(this._buttonAction(dev,"Standby","climate","set_hvac_mode","climate",
        {hvac_mode:"heat_cool"},"Activates the controller's standby temperature."));
    acts.append(this._buttonAction(dev,"Stop heating","climate","set_hvac_mode","climate",
      {hvac_mode:"off"},"Switches off sauna heating.","danger"));
    card.append(acts);
    const temp=this._el("div",null,"action-row");
    const tempLabel=this._el("label","Target temperature (°C)");
    const tempInput=this._el("input");tempInput.type="number";tempInput.min="40";tempInput.max="110";tempInput.step="1";
    const t=this._display(dev,"temperature_setpoint");
    tempInput.value=t==="—"?"80":String(Math.round(Number(t)));
    tempLabel.append(tempInput);temp.append(tempLabel);
    const tempSave=this._btn("Set temperature",()=>{
      const val=Number(tempInput.value);
      if(!Number.isFinite(val)||val<40||val>110){this._announce("Temperature must be 40–110 °C.");return;}
      this._run(dev,"climate","set_temperature","climate",{temperature:val},
        "Set temperature",val+" °C. Check the sauna is safe before raising the temperature.");
    });tempSave.dataset.deviceAction=dev.id;tempSave.dataset.entity=dev.entities.climate||"";
    temp.append(tempSave);card.append(temp);
    const stop=this._el("div",null,"action-row");
    const stopLabel=this._el("label","Stop after (minutes)");
    const stopInput=this._el("input");stopInput.type="number";stopInput.min="0";stopInput.max="600";stopInput.step="1";
    const mins=this._display(dev,"stop_time");stopInput.value=mins==="—"?"120":mins;
    stopLabel.append(stopInput);stop.append(stopLabel);
    const stopSave=this._btn("Set timer",()=>{
      const val=Number(stopInput.value);
      if(!Number.isInteger(val)||val<0||val>600){this._announce("Stop time must be 0–600 minutes.");return;}
      this._run(dev,"number","set_value","stop_time",{value:val},
        "Set stop time",val+" minutes.");
    });stopSave.dataset.deviceAction=dev.id;stopSave.dataset.entity=dev.entities.stop_time||"";
    stop.append(stopSave);card.append(stop);
    const light=this._el("div",null,"action-row");
    light.append(this._buttonAction(dev,"Lights on","light","turn_on","light",{},"Turn on sauna lights."));
    light.append(this._buttonAction(dev,"Lights off","light","turn_off","light",{},"Turn off sauna lights."));
    card.append(light);
    const favState=this._value(dev,"favorite");
    if(favState&&Array.isArray(favState.attributes?.options)&&favState.attributes.options.length){
      const fav=this._el("div",null,"action-row");
      const label=this._el("label","Favorite preset");const select=this._el("select");
      for(const opt of favState.attributes.options){
        const item=this._el("option",opt);item.value=opt;select.append(item);
      }
      if(favState.state&&favState.attributes.options.includes(favState.state))select.value=favState.state;
      label.append(select);fav.append(label);
      const apply=this._btn("Apply favorite",()=>this._run(dev,"select","select_option","favorite",
        {option:select.value},"Apply favorite",
        "Applies this preset's temperature, timer and lighting. Heating must be started separately."));
      apply.dataset.deviceAction=dev.id;apply.dataset.entity=dev.entities.favorite||"";
      fav.append(apply);card.append(fav);
    }
    card.append(this._el("h3","Device and safety"));
    const details=this._el("div");
    for(const [name,key] of [
      ["Light","light"],["Fault code","fault_code"],["Fault message","fault_message"],["Programs","programs"]
    ]){
      const row=this._row(name,"—");
      row.lastChild.dataset.detail=dev.id+"|"+key;details.append(row);
    }
    const endpoint=this._row("Active controller address","—");
    endpoint.lastChild.dataset.endpoint=dev.id;details.append(endpoint);
    card.append(details);
    return card;
  }
  _svg(tag,attrs={}){
    const el=document.createElementNS("http://www.w3.org/2000/svg",tag);
    for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
    return el;
  }
  _chartCard(meta){
    const el=this._el("section",null,"card");
    el.append(this._el("h2",meta.title));
    const plot=this._el("div",null,"plot");plot.dataset.plot=meta.key;
    el.append(plot);return el;
  }
  _period(){
    const days=(Date.parse(this._range.end)-Date.parse(this._range.start))/86400000;
    return days<=2?"5minute":days<=21?"hour":days<=120?"day":days<=550?"week":"month";
  }
  async _loadHistory(){
    if(!this._hass||!this._ready)return;
    const token=++this._request;this._chartRefresh=Date.now();
    const start=this._range.start,end=this._range.end;
    const plotKeys=[...new Set([...SA_CHARTS.flatMap(m=>m.keys),"heating_active","standby_active"])];
    const ids=this._devices.flatMap(d=>plotKeys.map(k=>d.entities[k]).filter(Boolean));
    const unique=[...new Set(ids.filter(id=>this._hass.states[id]?.attributes?.state_class==="measurement"))];
    for(const meta of SA_CHARTS){this._errors[meta.key]="Loading statistics…";this._drawChart(meta);}
    if(unique.length){
      try{
        const result=await this._hass.callWS({type:"recorder/statistics_during_period",
          start_time:start,end_time:end,statistic_ids:unique,period:this._period(),
          types:["mean","min","max"]});
        if(token!==this._request)return;
        this._chartResults=result||{};
        for(const meta of SA_CHARTS)this._errors[meta.key]="";
      }catch(err){
        if(token!==this._request)return;
        this._chartResults={};
        for(const meta of SA_CHARTS)this._errors[meta.key]="Statistics unavailable: "+(err?.message||String(err));
      }
    }else{
      this._chartResults={};
      for(const meta of SA_CHARTS)this._errors[meta.key]="No statistics-enabled sensors found.";
    }
    if(token!==this._request)return;
    for(const meta of SA_CHARTS)this._drawChart(meta);
  }
  _drawChart(meta){
    const el=this.shadowRoot?.querySelector('[data-plot="'+meta.key+'"]');
    if(!el)return;
    el.replaceChildren();
    if(this._errors[meta.key]){el.append(this._el("p",this._errors[meta.key],"subtle"));return;}
    const series=[];
    for(let d=0;d<this._devices.length;d++){
      const dev=this._devices[d];
      for(let k=0;k<meta.keys.length;k++){
        const id=dev.entities[meta.keys[k]];
        const rows=Array.isArray(this._chartResults[id])?this._chartResults[id]:[];
        const values=rows.filter(r=>Number.isFinite(Number(r.start))&&r.mean!=null&&Number.isFinite(Number(r.mean)))
          .map(r=>({x:Number(r.start),y:Number(r.mean)})).sort((a,b)=>a.x-b.x);
        if(values.length)series.push({label:dev.name+" · "+meta.names[k],
          values,color:meta.colors[(k+d)%meta.colors.length],dash:k>0});
      }
    }
    if(!series.length){
      el.append(this._el("p","No long-term statistics for this period. New sensors begin collecting data after installation; historical climate values are not backfilled.","subtle"));
      if(meta.key==="humidity")el.append(this._el("p","Humidity may report 0% on sauna controllers without a humidity sensor.","subtle"));
      return;
    }
    const legend=this._el("div",null,"legend");
    for(const s of series){
      const item=this._el("span");
      const sw=this._el("i",null,"swatch");sw.style.background=s.color;
      if(s.dash)sw.style.borderTop="2px dashed "+s.color;
      item.append(sw,this._el("span",s.label));legend.append(item);
    }
    el.append(legend);
    const start=Date.parse(this._range.start),end=Date.parse(this._range.end);
    const pts=series.flatMap(s=>s.values.filter(v=>v.x>=start&&v.x<=end).map(v=>v.y));
    if(!pts.length){el.append(this._el("p","No measurements in selected dates.","subtle"));return;}
    let min=Math.min(...pts),max=Math.max(...pts);
    const pad=Math.max((max-min)*0.12,0.5);min-=pad;max+=pad;
    const W=890,H=300,L=57,R=15,T=17,B=48;
    const X=x=>L+(x-start)/(end-start)*(W-L-R);
    const Y=y=>T+(max-y)/(max-min)*(H-T-B);
    const svg=this._svg("svg",{viewBox:"0 0 "+W+" "+H,role:"img","aria-label":meta.title+" historical statistics"});
    for(let i=0;i<=4;i++){
      const y=T+i*(H-T-B)/4,v=max-i*(max-min)/4;
      svg.append(this._svg("line",{x1:L,x2:W-R,y1:y,y2:y,stroke:"var(--divider-color,#ddd)","stroke-width":1}));
      const text=this._svg("text",{x:L-7,y:y+4,"text-anchor":"end",fill:"var(--secondary-text-color,#888)","font-size":12});
      text.textContent=v.toFixed(1);svg.append(text);
    }
    for(let i=0;i<=4;i++){
      const x=L+i*(W-L-R)/4,ms=start+i*(end-start)/4;
      const label=this._svg("text",{x,y:H-21,"text-anchor":"middle",fill:"var(--secondary-text-color,#888)","font-size":12});
      label.textContent=new Date(ms).toLocaleDateString(undefined,
        {month:"short",day:(end-start)<100*86400000?"numeric":undefined,year:(end-start)>300*86400000?"2-digit":undefined});
      svg.append(label);
    }
    const clipId="tylo-plot-"+meta.key;
    const defs=this._svg("defs"),clip=this._svg("clipPath",{id:clipId});
    clip.append(this._svg("rect",{x:L,y:T,width:W-L-R,height:H-T-B}));defs.append(clip);svg.append(defs);
    for(const s of series){
      const vals=s.values.filter(v=>v.x>=start&&v.x<=end);
      if(!vals.length)continue;
      const path=vals.map((v,i)=>(i?"L":"M")+X(v.x).toFixed(2)+" "+Y(v.y).toFixed(2)).join(" ");
      svg.append(this._svg("path",{d:path,fill:"none",stroke:s.color,"stroke-width":2.3,
        "stroke-dasharray":s.dash?"7 4":"none","clip-path":"url(#"+clipId+")"}));
    }
    el.append(svg);
    if(meta.key==="temperature")this._appendSessionBands(el,start,end);
    el.append(this._el("p","Recorder "+this._period()+" averages · "+meta.unit+
      " · Existing data only; gaps are not interpolated.","subtle"));
  }
  _bucketEnd(startMs){
    // Long-term Recorder rows are one 5-minute/hour/day/week/month bucket.
    // Using the bucket width prevents drawing across unrecorded intervals.
    const period=this._period();
    if(period==="month"){
      const d=new Date(startMs);
      d.setUTCMonth(d.getUTCMonth()+1);
      return d.getTime();
    }
    const duration={"5minute":300000,hour:3600000,day:86400000,week:604800000}[period];
    return startMs+(duration||3600000);
  }
  _appendSessionBands(temperaturePlot,start,end){
    // This ribbon belongs to the temperature chart, not a separate activity
    // card. It uses exactly the same Recorder long-term statistics as the
    // temperature and humidity curves and therefore supports the 3-year picker.
    const block=this._el("div",null,"session-band");
    block.append(this._el("h3","Sessions · Heating and standby",""));
    const devices=this._devices.map(dev=>{
      const items=["heating_active","standby_active"].map((key,index)=>{
        const id=dev.entities[key];
        const entries=id&&Array.isArray(this._chartResults[id])?this._chartResults[id]:[];
        return {key,index,entries:entries
          .filter(row=>Number.isFinite(Number(row.start))&&row.mean!=null&&Number.isFinite(Number(row.mean)))
          .map(row=>({start:Number(row.start),mean:Math.max(0,Math.min(1,Number(row.mean)))}))
          .sort((a,b)=>a.start-b.start)};
      });
      return {name:dev.name,items};
    });
    if(!devices.some(dev=>dev.items.some(item=>item.entries.length))){
      block.append(this._el("p",
        "No long-term session-mode statistics collected yet. Heating and standby history will accumulate after updating the integration.",
        "subtle"));
      temperaturePlot.append(block);return;
    }
    const legend=this._el("div",null,"legend");
    for(const [label,color] of [["Heating","#d96b38"],["Standby","#8269bd"]]){
      const item=this._el("span");
      const swatch=this._el("i",null,"swatch");swatch.style.background=color;
      item.append(swatch,this._el("span",label));legend.append(item);
    }
    block.append(legend);
    const W=890,L=57,R=15,trackHeight=18,trackGap=12;
    const svg=this._svg("svg",{viewBox:"0 0 "+W+" "+(devices.length*(trackHeight+trackGap)+10),
      role:"img","aria-label":"Session heating and standby mode statistics"});
    const X=x=>L+(x-start)/(end-start)*(W-L-R);
    devices.forEach((dev,i)=>{
      const y=5+i*(trackHeight+trackGap);
      const label=this._svg("text",{x:L-7,y:y+13,"text-anchor":"end",fill:"var(--secondary-text-color,#888)","font-size":11});
      label.textContent=devices.length===1?"Mode":dev.name.slice(0,8);
      svg.append(label);
      svg.append(this._svg("rect",{x:L,y,width:W-L-R,height:trackHeight,rx:3,
        fill:"var(--secondary-background-color,#eeeeee)"}));
      for(const item of dev.items){
        const color=item.index===0?"#d96b38":"#8269bd";
        for(const record of item.entries){
          const from=Math.max(start,record.start);
          const to=Math.min(end,this._bucketEnd(record.start));
          if(to<=from||record.mean<=0)continue;
          const x=X(from),width=X(to)-x;
          if(width<=0)continue;
          const rect=this._svg("rect",{x,y:y+item.index*9,width:Math.max(0.7,width),height:9,
            fill:color,opacity:(0.2+0.8*record.mean).toFixed(2)});
          const tip=this._svg("title");
          tip.textContent=dev.name+" · "+(item.index===0?"Heating":"Standby")+
            " · "+new Date(record.start).toLocaleString()+" · "+
            Math.round(record.mean*100)+"% mean of recorded 0/1 states (not exact runtime)";
          rect.append(tip);svg.append(rect);
        }
      }
    });
    block.append(svg);
    block.append(this._el("p","Session shading is aggregated from numeric mode readings. "+
      "Short periods show more precise intervals; monthly/annual views show approximate activity, "+
      "not exact start/stop times or operating hours.","subtle"));
    temperaturePlot.append(block);
  }
  _updateLive(){
    if(!this._hass||!this._ready)return;
    const byId=new Map(this._devices.map(d=>[d.id,d]));
    for(const el of this.shadowRoot.querySelectorAll("[data-live]")){
      const [id,key,unit]=el.dataset.live.split("|");
      const dev=byId.get(id);if(dev)el.textContent=this._num(dev,key,unit);
    }
    for(const el of this.shadowRoot.querySelectorAll("[data-mode]")){
      const dev=byId.get(el.dataset.mode);
      if(dev)el.textContent=this._display(dev,"climate");
    }
    for(const el of this.shadowRoot.querySelectorAll("[data-status]")){
      const dev=byId.get(el.dataset.status);
      if(!dev)continue;
      const state=this._display(dev,"online");
      el.textContent=state==="on"?"Online":state==="off"?"Offline":"Unknown";
      el.className="tag "+(state==="on"?"on":state==="off"?"off":"");
    }
    for(const el of this.shadowRoot.querySelectorAll("[data-detail]")){
      const [id,key]=el.dataset.detail.split("|"),dev=byId.get(id);
      if(dev)el.textContent=this._display(dev,key);
    }
    for(const el of this.shadowRoot.querySelectorAll("[data-endpoint]")){
      const dev=byId.get(el.dataset.endpoint);
      if(!dev)continue;
      const attrs=this._value(dev,"online")?.attributes||{};
      const host=attrs.effective_host||"—",port=attrs.control_port;
      el.textContent=host+(port?" : "+port:"");
    }
    for(const el of this.shadowRoot.querySelectorAll("[data-device-action]")){
      const dev=byId.get(el.dataset.deviceAction);
      const hasTarget=!!el.dataset.entity;
      const state=dev?this._display(dev,"online"):"—";
      const online=state==="on"||(state==="—"&&this._display(dev,"climate")!=="—");
      el.disabled=!hasTarget||!online||this._busy.has(el.dataset.deviceAction);
      el.title=!online?"Sauna is not online":"";
    }
  }
  _render(){
    const root=this.shadowRoot;root.replaceChildren();
    const style=this._el("style");style.textContent=this._css();root.append(style);
    const shell=this._el("div",null,"shell");
    const header=this._el("header");
    const heading=this._el("div");
    heading.append(this._el("h1","Sauna"));
    heading.append(this._el("p","Tylo Elite · Integration-managed dashboard","subtle"));
    header.append(heading);
    header.append(this._btn("Refresh devices",()=>{this._ready=false;this._discover();}));
    shell.append(header);
    const notice=this._el("div",this._notice,"notice");notice.dataset.notice="";shell.append(notice);
    if(!this._ready){shell.append(this._el("p","Loading sauna device registry…","subtle"));root.append(shell);return;}
    if(!this._devices.length) shell.append(this._el("p","No configured Tylo Sauna devices found.","subtle"));
    const grid=this._el("div",null,"grid");
    for(const dev of this._devices)grid.append(this._deviceCard(dev));
    shell.append(grid);
    const filter=this._el("section",null,"date");
    filter.append(this._el("p","Shared history period · Same date picker as TadoX","picker-heading"));
    const picker=this._el("tylo-sauna-date-range-picker");
    picker.range=this._range;
    picker.addEventListener("date-range-changed",event=>{
      this._range=event.detail;this._loadHistory();
    });
    filter.append(picker);shell.append(filter);
    const charts=this._el("div",null,"charts");
    for(const meta of SA_CHARTS)charts.append(this._chartCard(meta));
    shell.append(charts);
    shell.append(this._el("p","Actions use Home Assistant's existing entities and safety checks. Recorder must be enabled for history. "+ 
      "All three charts use long-term Recorder statistics, including target settings and the heating/standby session band. "+
      "The dashboard is installed with this integration and refreshed on version updates.","subtle foot"));
    root.append(shell);this._updateLive();
    for(const meta of SA_CHARTS)this._drawChart(meta);
  }
}
if(!customElements.get("tylo-sauna-managed-panel"))
  customElements.define("tylo-sauna-managed-panel",TyloSaunaManagedPanel);
