(()=>{var V=new Set(["lowest ask","avg sale","all day","buy now","make offer","view listing","view all","for sale","not listed","back to marketplace","common","rare","legendary","ultimate","select and buy","listed for sale","total supply","top sale","log in","sign up"]),N=class{findEditionElements(){let e=[],t=new WeakSet,n=document.querySelectorAll('a[href*="/listing/moment/"]'),o=new Map;for(let s of n){let i=this.parseHref(s.href);i&&(o.has(i.momentId)||o.set(i.momentId,[]),o.get(i.momentId).push(s))}for(let[s,i]of o){let p=i.find(c=>c.querySelector("img, video"))||i.find(c=>!this.isBuyNowLink(c))||i[0];if(!p)continue;let r=this.findCardContainer(p);if(t.has(r))continue;t.add(r);let b=this.findPlayerName(r),g=this.findPrice(r);e.push({element:r,editionId:s,playerName:b,listingPrice:g})}return e}findCardContainer(e){let t=e.closest(".chakra-linkbox");if(t)return t;let n=e.parentElement;for(let o=0;o<6&&n;o++){let s=n.getBoundingClientRect();if(s.width>100&&s.height>100)return n;n=n.parentElement}return e}isBuyNowLink(e){let t=(e.textContent||"").toLowerCase().trim();return t.includes("buy now")||t.includes("select and buy")||t.includes("make offer")}findPlayerName(e){let t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(;t.nextNode();){let n=t.currentNode.textContent.trim();if(this.looksLikePlayerName(n))return n}return null}looksLikePlayerName(e){return!e||e.length<4||e.length>40||V.has(e.toLowerCase())?!1:/^[A-Z][a-zA-Z'.]+(\s+(Jr\.|Sr\.|II|III|IV|[A-Z][a-zA-Z'.]+)){1,3}$/.test(e)}findPrice(e){let t=e;for(let n=0;n<4&&t&&t!==document.body;n++){let o=(t.textContent||"").match(/\$\s*([\d,]+\.?\d*)/);if(o)return parseFloat(o[1].replace(",",""));t=t.parentElement}return null}parseHref(e){try{let n=new URL(e).pathname.match(/\/listing\/moment\/(\d+)/);if(n)return{momentId:n[1]}}catch{}return null}};function O(m){return String(m).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function q(m){try{let e=new URL(m);return e.protocol==="https:"||e.protocol==="http:"?m:null}catch{return null}}var A=class{constructor(e){this.product=e,this.observer=null,this.pills=new WeakMap,this.logoUrl=chrome.runtime.getURL("assets/logo.svg")}init(){this._startObserver()}observe(e){this.observer&&this.observer.observe(e)}_startObserver(){this.observer||(this.observer=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting&&this._showPill(t.target)},{rootMargin:"200px"}))}async _showPill(e){if(!e._vpData||this.pills.has(e))return;let{editionId:t,setId:n,playId:o,setUuid:s,playUuid:i,parallelID:h,listingPrice:p,listingUrl:r,supply:b,parallelHint:g}=e._vpData,c=null;try{let d=await chrome.runtime.sendMessage({action:"indexLookup",market:this.product,setUuid:s,playUuid:i,setId:n,playId:o,parallelID:h,editionId:t,supply:b,parallelHint:g});d?.success&&(c=d.data)}catch{}if(!e.isConnected)return;let y=c?.ev,f=y!=null&&y>0?y:c?.fp??p;if(!f||f<=0)return;let v=e;getComputedStyle(v).position==="static"&&(v.style.position="relative");let l=document.createElement("div");l.className="vp-pill",l.style.cssText=`
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
    `;let x=document.createElement("img");x.src=this.logoUrl,x.className="vp-icon",x.style.cssText="height: 14px; width: 14px; flex-shrink: 0; pointer-events: none;",x.alt="V";let _=document.createElement("span");_.textContent=f!=null&&f>0?(()=>{let d=Number(f),E=d%1!==0;return`$${d.toLocaleString(void 0,{minimumFractionDigits:E?2:0,maximumFractionDigits:2})}`})():"--",_.style.cssText="color: #a5b4fc; pointer-events: none;",l.appendChild(x),l.appendChild(_),l.addEventListener("mouseenter",()=>{l.style.transform="translateX(-50%) scale(1.08)",l.style.boxShadow="0 0 8px rgba(99, 102, 241, 0.5)"}),l.addEventListener("mouseleave",()=>{l.style.transform="translateX(-50%) scale(1)",l.style.boxShadow="none"});let C=this._createOverlay(e,r),w={pill:l,overlay:C,expanded:!1};this.pills.set(e,w),l.addEventListener("click",d=>{d.preventDefault(),d.stopPropagation(),w.expanded?this._collapse(w):this._expand(e,w)}),v.appendChild(l)}_createOverlay(e,t){let n=document.createElement("div");return n.className="vp-pill-overlay",n.style.cssText=`
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
    `,n.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;background:rgba(10,10,24,0.5);border-radius:4px;padding:2px 4px">
        <img src="${this.logoUrl}" style="height:14px;width:auto" alt="Vaultopolis">
        <button class="vp-pill-close" style="background:none;border:none;color:#8b8bab;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;font-family:inherit">&times;</button>
      </div>
      <div class="vp-pill-body" style="flex:1;display:flex;align-items:center;justify-content:center">
        <div style="color:#6366f1;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,0.9)">Loading analytics...</div>
      </div>
    `,n}async _expand(e,t){let{pill:n,overlay:o}=t;t.expanded=!0;let s=e;o.parentElement||s.appendChild(o),s.style.overflow="hidden",o.style.display="flex",requestAnimationFrame(()=>{o.style.opacity="1"}),n.style.display="none";let i=o.querySelector(".vp-pill-close");i&&!i._wired&&(i._wired=!0,i.addEventListener("click",l=>{l.preventDefault(),l.stopPropagation(),this._collapse(t)}));let{editionId:h,setId:p,playId:r,setUuid:b,playUuid:g,parallelID:c,listingPrice:y,listingUrl:f,supply:v,parallelHint:L}=e._vpData;try{let l=await chrome.runtime.sendMessage({action:"lookupOne",market:this.product,setUuid:b,playUuid:g,setId:p,playId:r,parallelID:c,editionId:h,supply:v,parallelHint:L});if(!t.expanded)return;l?.success&&l.data?this._renderDetails(o,l.data,y,f):o.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Data not available</div>
        `}catch{t.expanded&&(o.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Failed to load</div>
        `)}}_collapse(e){e.expanded=!1,e.overlay.style.opacity="0",setTimeout(()=>{e.overlay.style.display="none",e.overlay.parentElement&&(e.overlay.parentElement.style.overflow="")},150),e.pill.style.display="flex"}_renderDetails(e,t,n,o){let s=a=>a!=null&&a>0?`$${parseFloat(a).toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})}`:null,i=(a,u)=>u!=null&&u!==""?`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.4);text-shadow:0 1px 3px rgba(0,0,0,0.9)">
             <span style="color:#b0b3c8;font-size:12px">${a}</span>
             <span style="font-weight:600;font-size:13px;color:#f0f0f0">${u}</span>
           </div>`:"",h=t.floor_price,p=t.estimated_value,r=t.existing_supply||t.mint_count,b=t.unique_holders,g=t.concentration_pct,c=t.asp_7d,y=t.asp_30d,f=t.last_sale_price,v=t.total_sales_7d,L=t.total_sales_30d,l=t.total_listings||t.listed_count,x=t.floating_supply_pct,_=t.burn_count,C=t.highest_edition_offer||t.highest_offer,w=t.edition_offer_count,d=t.liquidity_score,E={price:[i("Floor",s(h)),i("Est. Value",s(p)),i("7d Avg",c?s(c):"N/A"),i("30d Avg",y?s(y):"N/A"),i("Last Sale",s(f))].join(""),supply:[i("Supply",r?Number(r).toLocaleString():null),_?i("Burned",Number(_).toLocaleString()):"",i("Listed",l!=null?Number(l).toLocaleString():null),i("Holders",b!=null?Number(b).toLocaleString():null),i("Top Holder",g!=null?`${Number(g).toFixed(1)}%`:null),i("Floating",x!=null?`${Number(x).toFixed(1)}%`:null)].join(""),offers:[i("Top Offer",C?s(C):"N/A"),i("Offers",w?String(w):null),i("Sales (7d)",v!=null?String(v):null),i("Sales (30d)",L!=null?String(L):null),i("Liquidity",d!=null?`${Math.round(d)}/100`:null)].join("")},z=(()=>{if(this.product==="allday"||this.product==="pinnacle"){let k=t.edition_id;return k?`https://vaultopolis.com/analytics/${this.product}/edition/${k}`:"https://vaultopolis.com"}let a=t.setID||t.set_id,u=t.playID||t.play_id;if(!a||!u)return"https://vaultopolis.com";let S=t.subeditionID??t.subedition_id;return S!=null&&S!==0&&S!=="0"?`https://vaultopolis.com/analytics/topshot/edition/${a}/${u}/${S}`:`https://vaultopolis.com/analytics/topshot/edition/${a}/${u}`})(),M="flex:1;overflow-y:auto;padding:2px 0;background:rgba(10,10,24,0.35);border-radius:0 0 4px 4px",$=e.querySelector(".vp-pill-body");$.style.cssText="flex:1;display:flex;flex-direction:column;overflow:hidden;",$.innerHTML=`
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px;background:rgba(10,10,24,0.45);border-radius:4px 4px 0 0">
        <button class="vp-pill-tab vp-pill-tab-active" data-tab="price" style="flex:1;padding:5px 0;border:none;background:none;color:#6366f1;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Price</button>
        <button class="vp-pill-tab" data-tab="supply" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Supply</button>
        <button class="vp-pill-tab" data-tab="offers" style="flex:1;padding:5px 0;border:none;background:none;color:#9ca3af;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,0.8)">Offers</button>
      </div>
      <div class="vp-pill-panel" data-panel="price" style="${M};display:block">${E.price}</div>
      <div class="vp-pill-panel" data-panel="supply" style="${M};display:none">${E.supply}</div>
      <div class="vp-pill-panel" data-panel="offers" style="${M};display:none">${E.offers}</div>
      <div style="display:flex;gap:6px;padding-top:6px;border-top:1px solid rgba(45,45,74,0.6);margin-top:4px;flex-shrink:0">
        ${q(o)?`<a href="${O(o)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(99,102,241,0.9);color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>`:""}
        <a href="${O(z)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:rgba(10,10,24,0.6);color:#a5b4fc;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>
      </div>
    `,$.querySelectorAll(".vp-pill-tab").forEach(a=>{a.addEventListener("click",u=>{u.preventDefault(),u.stopPropagation();let S=a.dataset.tab;$.querySelectorAll(".vp-pill-tab").forEach(k=>{k.style.color="#9ca3af",k.style.borderBottomColor="transparent"}),a.style.color="#6366f1",a.style.borderBottomColor="#6366f1",$.querySelectorAll(".vp-pill-panel").forEach(k=>{k.style.display=k.dataset.panel===S?"block":"none"})})})}};var I=":not(.vp-icon)",D={topshot:{videos:'.chakra-linkbox video, a[href*="/listings/"] video',images:`.chakra-linkbox img${I}:not([src*="badge"]):not([src*="icon"]):not([src*="tier"]):not([src*="avatar"]):not([class*="avatar"]), a[href*="/listings/"] img${I}:not([src*="badge"]):not([src*="icon"])`},allday:{videos:'a[href*="/listing/moment/"] video, a[href*="/listing/moment/"] ~ video',images:`a[href*="/listing/moment/"] img${I}:not(.chakra-avatar__img):not([src*="badge"]):not([src*="icon"]), a[href*="/listing/moment/"] picture img${I}:not(.chakra-avatar__img)`},pinnacle:{videos:'a[href*="/pin/"] video, a[href*="/collectible/"] video',images:`a[href*="/pin/"] img${I}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"]), a[href*="/collectible/"] img${I}:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"])`}},T=class{constructor(e){this.site=e,this.sel=D[e]||D.topshot,this._mediaObs=null}init(){this.apply(),chrome.storage.onChanged.addListener(e=>{(e.mediaMode||e.blockVideos||e.reduceImages||e.blockAllMedia||e.pauseVideos)&&this.apply()})}apply(){chrome.storage.local.get(["mediaMode","pauseVideos","blockVideos","reduceImages","blockAllMedia"],e=>{let t=e.mediaMode||null;t||(e.blockAllMedia?t="blockAll":e.blockVideos?t="block":e.pauseVideos?t="pause":t="normal");let n=t==="pause",o=t==="block"||t==="blockAll",s=!1,i=t==="blockAll";this._setCSS("vp-block-videos",o,`${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-reduce-images",s&&!i,`${this.sel.images} { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`),this._setCSS("vp-block-all-media",i,`${this.sel.images} { visibility: hidden !important; opacity: 0 !important; }
         ${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-overlay-restore",o||s||i,`.vp-pill, .vp-pill * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }
         .vp-pill-overlay, .vp-pill-overlay * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }`);let h=o||n;this._mediaObs&&(this._mediaObs.disconnect(),this._mediaObs=null),h&&(this._killVideos(),this._mediaObs=new MutationObserver(p=>{p.some(r=>r.addedNodes.length>0)&&this._killVideos()}),this._mediaObs.observe(document.body,{childList:!0,subtree:!0}))})}_setCSS(e,t,n){let o=document.getElementById(e);if(t&&!o){let s=document.createElement("style");s.id=e,s.textContent=n,document.head.appendChild(s)}else!t&&o&&o.remove()}_killVideos(){document.querySelectorAll(this.sel.videos).forEach(e=>{e.pause(),e.removeAttribute("autoplay"),e.preload="none"})}};var P=class{constructor(){this.detector=new N,this.pill=new A("allday"),this.currentUrl=window.location.href,this.processedElements=new WeakSet,this.debounceTimer=null,this.enabled=!0,this.product="allday"}init(){chrome.storage.local.get(["enabled"],e=>{this.enabled=e.enabled!==!1,this.enabled&&(new T("allday").init(),this.pill.init(),chrome.runtime.sendMessage({action:"ensureIndex",market:this.product}),this.watchNavigation(),this.watchDOM(),setTimeout(()=>this.scanPage(),3e3),setTimeout(()=>this.scanPage(),6e3))}),chrome.storage.onChanged.addListener(e=>{e.enabled&&(this.enabled=e.enabled.newValue)})}watchNavigation(){let e=()=>{let o=window.location.href;o!==this.currentUrl&&(this.currentUrl=o,setTimeout(()=>this.scanPage(),800))},t=history.pushState.bind(history),n=history.replaceState.bind(history);history.pushState=(...o)=>{t(...o),e()},history.replaceState=(...o)=>{n(...o),e()},window.addEventListener("popstate",e)}watchDOM(){new MutationObserver(t=>{clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>{t.some(n=>n.addedNodes.length>0)&&this.scanPage()},500)}).observe(document.body,{childList:!0,subtree:!0})}scanPage(){if(this.enabled)for(let{element:e,editionId:t,playerName:n,listingPrice:o}of this.detector.findEditionElements()){if(this.processedElements.has(e))continue;this.processedElements.add(e);let i=(e.tagName==="A"?e:e.querySelector('a[href*="/listing/moment/"]'))?.href||e.href||"";e._vpData={editionId:t,playerName:n,listingPrice:o,listingUrl:i},this.pill.observe(e)}}},U=new P;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>U.init()):U.init();})();
