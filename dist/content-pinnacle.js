(()=>{var O=new Set(["marketplace","trade","releases","news","pinbooks","sign up","sign in","log in","buy now","make offer","listed digital pins only","newest listings","lowest price","highest price","pin names","edition types","sort by","status"]),N=class{findEditionElements(){let e=[],t=new WeakSet,o=document.querySelectorAll('a[href*="/pin/"]');for(let i of o){let s=this.parseHref(i.href);if(!s)continue;let n=this.findCardContainer(i);if(t.has(n))continue;t.add(n);let p=this.findPinName(n),d=this.findPrice(n);e.push({element:n,editionId:s.pinId,playerName:p,listingPrice:d})}return e}findCardContainer(e){let t=e.closest(".chakra-linkbox");if(t)return t;let o=e.parentElement;for(let i=0;i<6&&o;i++){let s=o.getBoundingClientRect();if(s.width>80&&s.height>80)return o;o=o.parentElement}return e}findPinName(e){let t=e.querySelector("img[alt]");if(t?.alt&&t.alt.length>2&&t.alt.length<50){let i=t.alt.trim();if(!O.has(i.toLowerCase()))return i}let o=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(;o.nextNode();){let i=o.currentNode.textContent.trim();if(i.length>=3&&i.length<=50&&!O.has(i.toLowerCase())&&/^[A-Z]/.test(i))return i}return null}findPrice(e){let t=e;for(let o=0;o<4&&t&&t!==document.body;o++){let i=(t.textContent||"").match(/(?:Buy for\s*)?\$\s*([\d,]+\.?\d*)/);if(i)return parseFloat(i[1].replace(",",""));t=t.parentElement}return null}parseHref(e){try{let o=new URL(e).pathname.match(/\/pin\/(\d+)/);if(o)return{pinId:o[1]}}catch{}return null}};function D(f){return String(f).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function V(f){try{let e=new URL(f);return e.protocol==="https:"||e.protocol==="http:"?f:null}catch{return null}}var T=class{constructor(e){this.product=e,this.observer=null,this.pills=new WeakMap,this.logoUrl=chrome.runtime.getURL("assets/logo.svg")}init(){this._startObserver()}observe(e){this.observer&&this.observer.observe(e)}_startObserver(){this.observer||(this.observer=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting&&this._showPill(t.target)},{rootMargin:"200px"}))}async _showPill(e){if(!e._vpData||this.pills.has(e))return;let{editionId:t,setId:o,playId:i,setUuid:s,playUuid:n,parallelID:p,listingPrice:d,listingUrl:h,supply:k,parallelHint:_}=e._vpData,m=null;try{let a=await chrome.runtime.sendMessage({action:"indexLookup",market:this.product,setUuid:s,playUuid:n,setId:o,playId:i,parallelID:p,editionId:t,supply:k,parallelHint:_});a?.success&&(m=a.data)}catch{}if(!e.isConnected)return;let b=m?.ev,u=b!=null&&b>0?b:m?.fp??d;if(!u||u<=0)return;let g=e;getComputedStyle(g).position==="static"&&(g.style.position="relative");let l=document.createElement("div");l.className="vp-pill",l.style.cssText=`
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(10, 10, 24, 0.75);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 16px;
      padding: 4px 8px 4px 5px;
      cursor: pointer;
      z-index: 10;
      pointer-events: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: #e0e0e0;
      line-height: 1;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      user-select: none;
      white-space: nowrap;
    `;let y=document.createElement("img");y.src=this.logoUrl,y.className="vp-icon",y.style.cssText="height: 14px; width: 14px; flex-shrink: 0; pointer-events: none;",y.alt="V";let w=document.createElement("span");w.textContent=u!=null&&u>0?(()=>{let a=Number(u),L=a%1!==0;return`$${a.toLocaleString(void 0,{minimumFractionDigits:L?2:0,maximumFractionDigits:2})}`})():"--",w.style.cssText="color: #a5b4fc; pointer-events: none;",l.appendChild(y),l.appendChild(w),l.addEventListener("mouseenter",()=>{l.style.transform="translateX(-50%) scale(1.08)",l.style.boxShadow="0 0 8px rgba(99, 102, 241, 0.5)"}),l.addEventListener("mouseleave",()=>{l.style.transform="translateX(-50%) scale(1)",l.style.boxShadow="none"});let I=this._createOverlay(e,h),v={pill:l,overlay:I,expanded:!1};this.pills.set(e,v),l.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),v.expanded?this._collapse(v):this._expand(e,v)}),g.appendChild(l)}_createOverlay(e,t){let o=document.createElement("div");return o.className="vp-pill-overlay",o.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        to bottom,
        rgba(10, 10, 24, 0.93) 0%,
        rgba(10, 10, 24, 0.55) 38%,
        rgba(10, 10, 24, 0.55) 62%,
        rgba(10, 10, 24, 0.93) 100%
      );
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #e0e0e0;
      padding: 8px 10px;
      box-sizing: border-box;
      display: none;
      flex-direction: column;
      z-index: 10;
      pointer-events: auto;
      border-radius: 6px;
      opacity: 0;
      transition: opacity 0.15s ease;
      overflow-y: auto;
      overflow-x: hidden;
    `,o.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;background:rgba(10,10,24,0.5);border-radius:4px;padding:2px 4px">
        <img src="${this.logoUrl}" style="height:14px;width:auto" alt="Vaultopolis">
        <button class="vp-pill-close" style="background:none;border:none;color:#8b8bab;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;font-family:inherit">&times;</button>
      </div>
      <div class="vp-pill-body" style="flex:1;display:flex;align-items:center;justify-content:center">
        <div style="color:#6366f1;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,0.9)">Loading analytics...</div>
      </div>
    `,o}async _expand(e,t){let{pill:o,overlay:i}=t;t.expanded=!0;let s=e;i.parentElement||s.appendChild(i),s.style.overflow="hidden",i.style.display="flex",requestAnimationFrame(()=>{i.style.opacity="1"}),o.style.display="none";let n=i.querySelector(".vp-pill-close");n&&!n._wired&&(n._wired=!0,n.addEventListener("click",l=>{l.preventDefault(),l.stopPropagation(),this._collapse(t)}));let{editionId:p,setId:d,playId:h,setUuid:k,playUuid:_,parallelID:m,listingPrice:b,listingUrl:u,supply:g,parallelHint:$}=e._vpData;try{let l=await chrome.runtime.sendMessage({action:"lookupOne",market:this.product,setUuid:k,playUuid:_,setId:d,playId:h,parallelID:m,editionId:p,supply:g,parallelHint:$});if(!t.expanded)return;l?.success&&l.data?this._renderDetails(i,l.data,b,u):i.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Data not available</div>
        `}catch{t.expanded&&(i.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Failed to load</div>
        `)}}_collapse(e){e.expanded=!1,e.overlay.style.opacity="0",setTimeout(()=>{e.overlay.style.display="none",e.overlay.parentElement&&(e.overlay.parentElement.style.overflow="")},150),e.pill.style.display="flex"}_renderDetails(e,t,o,i){let s=r=>r!=null&&r>0?`$${parseFloat(r).toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})}`:null,n=(r,c)=>c!=null&&c!==""?`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)">
             <span style="color:#b0b3c8;font-size:12px">${r}</span>
             <span style="font-weight:600;font-size:13px;color:#f0f0f0">${c}</span>
           </div>`:"",p=t.floor_price,d=t.estimated_value,h=t.existing_supply||t.mint_count,k=t.unique_holders,_=t.concentration_pct,m=t.asp_7d,b=t.asp_30d,u=t.last_sale_price,g=t.total_sales_7d,$=t.total_sales_30d,l=t.total_listings||t.listed_count,y=t.floating_supply_pct,w=t.burn_count,I=t.highest_edition_offer||t.highest_offer,v=t.edition_offer_count,a=t.liquidity_score,L={price:[n("Floor",s(p)),n("Est. Value",s(d)),n("7d Avg",m?s(m):"N/A"),n("30d Avg",b?s(b):"N/A"),n("Last Sale",s(u))].join(""),supply:[n("Supply",h?Number(h).toLocaleString():null),w?n("Burned",Number(w).toLocaleString()):"",n("Listed",l!=null?Number(l).toLocaleString():null),n("Holders",k!=null?Number(k).toLocaleString():null),n("Top Holder",_!=null?`${Number(_).toFixed(1)}%`:null),n("Floating",y!=null?`${Number(y).toFixed(1)}%`:null)].join(""),offers:[n("Top Offer",I?s(I):"N/A"),n("Offers",v?String(v):null),n("Sales (7d)",g!=null?String(g):null),n("Sales (30d)",$!=null?String($):null),n("Liquidity",a!=null?`${Math.round(a)}/100`:null)].join("")},F=(()=>{if(this.product==="allday"||this.product==="pinnacle"){let x=t.edition_id;return x?`https://vaultopolis.com/analytics/${this.product}/edition/${x}`:"https://vaultopolis.com"}let r=t.setID||t.set_id,c=t.playID||t.play_id;if(!r||!c)return"https://vaultopolis.com";let S=t.subeditionID??t.subedition_id;return S!=null&&S!==0&&S!=="0"?`https://vaultopolis.com/analytics/topshot/edition/${r}/${c}/${S}`:`https://vaultopolis.com/analytics/topshot/edition/${r}/${c}`})(),P="flex:1;overflow-y:auto;padding:2px 0;background:rgba(10,10,24,0.35);border-radius:0 0 4px 4px",C=e.querySelector(".vp-pill-body");C.style.cssText="flex:1;display:flex;flex-direction:column;overflow:hidden;",C.innerHTML=`
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px;background:rgba(10,10,24,0.45);border-radius:4px 4px 0 0">
        <button class="vp-pill-tab vp-pill-tab-active" data-tab="price" style="flex:1;padding:5px 0;border:none;background:none;color:#6366f1;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Price</button>
        <button class="vp-pill-tab" data-tab="supply" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Supply</button>
        <button class="vp-pill-tab" data-tab="offers" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Offers</button>
      </div>
      <div class="vp-pill-panel" data-panel="price" style="${P};display:block">${L.price}</div>
      <div class="vp-pill-panel" data-panel="supply" style="${P};display:none">${L.supply}</div>
      <div class="vp-pill-panel" data-panel="offers" style="${P};display:none">${L.offers}</div>
      <div style="display:flex;gap:6px;padding-top:6px;border-top:1px solid rgba(45,45,74,0.6);margin-top:4px;flex-shrink:0">
        ${V(i)?`<a href="${D(i)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(99,102,241,0.9);color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>`:""}
        <a href="${D(F)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(10,10,24,0.6);color:#a5b4fc;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>
      </div>
    `,C.querySelectorAll(".vp-pill-tab").forEach(r=>{r.addEventListener("click",c=>{c.preventDefault(),c.stopPropagation();let S=r.dataset.tab;C.querySelectorAll(".vp-pill-tab").forEach(x=>{x.style.color="#9ca3af",x.style.borderBottomColor="transparent"}),r.style.color="#6366f1",r.style.borderBottomColor="#6366f1",C.querySelectorAll(".vp-pill-panel").forEach(x=>{x.style.display=x.dataset.panel===S?"block":"none"})})})}};var E=":not(.vp-icon)",U={topshot:{videos:'.chakra-linkbox video, a[href*="/listings/"] video',images:`.chakra-linkbox img${E}:not([src*="badge"]):not([src*="icon"]):not([src*="tier"]):not([src*="avatar"]):not([class*="avatar"]), a[href*="/listings/"] img${E}:not([src*="badge"]):not([src*="icon"])`},allday:{videos:'a[href*="/listing/moment/"] video, a[href*="/listing/moment/"] ~ video',images:`a[href*="/listing/moment/"] img${E}:not(.chakra-avatar__img):not([src*="badge"]):not([src*="icon"]), a[href*="/listing/moment/"] picture img${E}:not(.chakra-avatar__img)`},pinnacle:{videos:'a[href*="/pin/"] video, a[href*="/collectible/"] video',images:`a[href*="/pin/"] img${E}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"]), a[href*="/collectible/"] img${E}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"])`}},A=class{constructor(e){this.site=e,this.sel=U[e]||U.topshot,this._mediaObs=null}init(){this.apply(),chrome.storage.onChanged.addListener(e=>{(e.mediaMode||e.blockVideos||e.reduceImages||e.blockAllMedia||e.pauseVideos)&&this.apply()})}apply(){chrome.storage.local.get(["mediaMode","pauseVideos","blockVideos","reduceImages","blockAllMedia"],e=>{let t=e.mediaMode||null;t||(e.blockAllMedia?t="blockAll":e.blockVideos?t="block":e.pauseVideos?t="pause":t="normal");let o=t==="pause",i=t==="block"||t==="blockAll",s=!1,n=t==="blockAll";this._setCSS("vp-block-videos",i,`${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-reduce-images",s&&!n,`${this.sel.images} { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`),this._setCSS("vp-block-all-media",n,`${this.sel.images} { visibility: hidden !important; opacity: 0 !important; }
         ${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-overlay-restore",i||s||n,`.vp-pill, .vp-pill * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }
         .vp-pill-overlay, .vp-pill-overlay * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }`);let p=i||o;this._mediaObs&&(this._mediaObs.disconnect(),this._mediaObs=null),p&&(this._killVideos(),this._mediaObs=new MutationObserver(d=>{d.some(h=>h.addedNodes.length>0)&&this._killVideos()}),this._mediaObs.observe(document.body,{childList:!0,subtree:!0}))})}_setCSS(e,t,o){let i=document.getElementById(e);if(t&&!i){let s=document.createElement("style");s.id=e,s.textContent=o,document.head.appendChild(s)}else!t&&i&&i.remove()}_killVideos(){document.querySelectorAll(this.sel.videos).forEach(e=>{e.pause(),e.removeAttribute("autoplay"),e.preload="none"})}};var M=class{constructor(){this.detector=new N,this.pill=new T("pinnacle"),this.currentUrl=window.location.href,this.processedElements=new WeakSet,this.debounceTimer=null,this.enabled=!0,this.product="pinnacle"}init(){chrome.storage.local.get(["enabled"],e=>{this.enabled=e.enabled!==!1,this.enabled&&(new A("pinnacle").init(),this.pill.init(),chrome.runtime.sendMessage({action:"ensureIndex",market:this.product}),this.watchNavigation(),this.watchDOM(),setTimeout(()=>this.scanPage(),5e3),setTimeout(()=>this.scanPage(),1e4),setTimeout(()=>this.scanPage(),2e4),setTimeout(()=>this.scanPage(),3e4))}),chrome.storage.onChanged.addListener(e=>{e.enabled&&(this.enabled=e.enabled.newValue)})}watchNavigation(){let e=()=>{let i=window.location.href;i!==this.currentUrl&&(this.currentUrl=i,setTimeout(()=>this.scanPage(),800))},t=history.pushState.bind(history),o=history.replaceState.bind(history);history.pushState=(...i)=>{t(...i),e()},history.replaceState=(...i)=>{o(...i),e()},window.addEventListener("popstate",e)}watchDOM(){new MutationObserver(t=>{clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>{t.some(i=>i.addedNodes.length>0||i.type==="attributes")&&this.scanPage()},500)}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["href","src","alt"]})}scanPage(){if(this.enabled)for(let{element:e,editionId:t,playerName:o,listingPrice:i}of this.detector.findEditionElements()){if(this.processedElements.has(e))continue;this.processedElements.add(e);let n=(e.tagName==="A"?e:e.querySelector('a[href*="/pin/"]'))?.href||e.href||"";e._vpData={editionId:t,playerName:o,listingPrice:i,listingUrl:n},this.pill.observe(e)}}},q=new M;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>q.init()):q.init();})();
