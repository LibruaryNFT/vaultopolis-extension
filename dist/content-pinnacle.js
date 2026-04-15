(()=>{var O=new Set(["marketplace","trade","releases","news","pinbooks","sign up","sign in","log in","buy now","make offer","listed digital pins only","newest listings","lowest price","highest price","pin names","edition types","sort by","status"]),I=class{findEditionElements(){let e=[],t=new WeakSet,o=document.querySelectorAll('a[href*="/pin/"]');for(let i of o){let r=this.parseHref(i.href);if(!r)continue;let n=this.findCardContainer(i);if(t.has(n))continue;t.add(n);let f=this.findPinName(n),m=this.findPrice(n);e.push({element:n,editionId:r.pinId,playerName:f,listingPrice:m})}return e}findCardContainer(e){let t=e.closest(".chakra-linkbox");if(t)return t;let o=e.parentElement;for(let i=0;i<6&&o;i++){let r=o.getBoundingClientRect();if(r.width>80&&r.height>80)return o;o=o.parentElement}return e}findPinName(e){let t=e.querySelector("img[alt]");if(t?.alt&&t.alt.length>2&&t.alt.length<50){let i=t.alt.trim();if(!O.has(i.toLowerCase()))return i}let o=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);for(;o.nextNode();){let i=o.currentNode.textContent.trim();if(i.length>=3&&i.length<=50&&!O.has(i.toLowerCase())&&/^[A-Z]/.test(i))return i}return null}findPrice(e){let t=e;for(let o=0;o<4&&t&&t!==document.body;o++){let i=(t.textContent||"").match(/(?:Buy for\s*)?\$\s*([\d,]+\.?\d*)/);if(i)return parseFloat(i[1].replace(",",""));t=t.parentElement}return null}parseHref(e){try{let o=new URL(e).pathname.match(/\/pin\/(\d+)/);if(o)return{pinId:o[1]}}catch{}return null}};function P(w){return String(w).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}var T=class{constructor(e){this.product=e,this.observer=null,this.pills=new WeakMap,this.logoUrl=chrome.runtime.getURL("assets/logo.svg")}init(){this._startObserver()}observe(e){this.observer&&this.observer.observe(e)}_startObserver(){this.observer||(this.observer=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting&&this._showPill(t.target)},{rootMargin:"200px"}))}async _showPill(e){if(!e._vpData||this.pills.has(e))return;let{editionId:t,setId:o,playId:i,setUuid:r,playUuid:n,parallelID:f,listingPrice:m,listingUrl:y,supply:v}=e._vpData,d=null;try{let a=await chrome.runtime.sendMessage({action:"indexLookup",market:this.product,setUuid:r,playUuid:n,setId:o,playId:i,parallelID:f,editionId:t,supply:v});a?.success&&(d=a.data)}catch{}if(!e.isConnected)return;let u=d?.ev,c=u!=null&&u>0?u:d?.fp??m;if(!c||c<=0)return;let h=e;getComputedStyle(h).position==="static"&&(h.style.position="relative");let s=document.createElement("div");s.className="vp-pill",s.style.cssText=`
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
    `;let b=document.createElement("img");b.src="https://storage.googleapis.com/vaultopolis/VaultopolisIcon.svg",b.style.cssText="height: 14px; width: 14px; flex-shrink: 0; pointer-events: none;",b.alt="V";let x=document.createElement("span");x.textContent=c!=null&&c>0?(()=>{let a=Number(c),C=a%1!==0;return`$${a.toLocaleString(void 0,{minimumFractionDigits:C?2:0,maximumFractionDigits:2})}`})():"--",x.style.cssText="color: #a5b4fc; pointer-events: none;",s.appendChild(b),s.appendChild(x),s.addEventListener("mouseenter",()=>{s.style.transform="translateX(-50%) scale(1.08)",s.style.boxShadow="0 0 8px rgba(99, 102, 241, 0.5)"}),s.addEventListener("mouseleave",()=>{s.style.transform="translateX(-50%) scale(1)",s.style.boxShadow="none"});let L=this._createOverlay(e,y),g={pill:s,overlay:L,expanded:!1};this.pills.set(e,g),s.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),g.expanded?this._collapse(g):this._expand(e,g)}),h.appendChild(s)}_createOverlay(e,t){let o=document.createElement("div");return o.className="vp-pill-overlay",o.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10, 10, 24, 0.96);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <img src="${this.logoUrl}" style="height:14px;width:auto" alt="Vaultopolis">
        <button class="vp-pill-close" style="background:none;border:none;color:#8b8bab;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;font-family:inherit">&times;</button>
      </div>
      <div class="vp-pill-body" style="flex:1;display:flex;align-items:center;justify-content:center">
        <div style="color:#6366f1;font-size:12px">Loading analytics...</div>
      </div>
    `,o}async _expand(e,t){let{pill:o,overlay:i}=t;t.expanded=!0;let r=e;i.parentElement||r.appendChild(i),r.style.overflow="hidden",i.style.display="flex",requestAnimationFrame(()=>{i.style.opacity="1"}),o.style.display="none";let n=i.querySelector(".vp-pill-close");n&&!n._wired&&(n._wired=!0,n.addEventListener("click",s=>{s.preventDefault(),s.stopPropagation(),this._collapse(t)}));let{editionId:f,setId:m,playId:y,setUuid:v,playUuid:d,parallelID:u,listingPrice:c,listingUrl:h,supply:k}=e._vpData;try{let s=await chrome.runtime.sendMessage({action:"lookupOne",market:this.product,setUuid:v,playUuid:d,setId:m,playId:y,parallelID:u,editionId:f,supply:k});if(!t.expanded)return;s?.success&&s.data?this._renderDetails(i,s.data,c,h):i.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Data not available</div>
        `}catch{t.expanded&&(i.querySelector(".vp-pill-body").innerHTML=`
          <div style="color:#f87171;font-size:12px">Failed to load</div>
        `)}}_collapse(e){e.expanded=!1,e.overlay.style.opacity="0",setTimeout(()=>{e.overlay.style.display="none",e.overlay.parentElement&&(e.overlay.parentElement.style.overflow="")},150),e.pill.style.display="flex"}_renderDetails(e,t,o,i){let r=l=>l!=null&&l>0?`$${parseFloat(l).toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})}`:null,n=(l,p)=>p!=null&&p!==""?`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(45,45,74,0.5)">
             <span style="color:#8b8bab;font-size:12px">${l}</span>
             <span style="font-weight:600;font-size:13px;color:#e0e0e0">${p}</span>
           </div>`:"",f=t.floor_price,m=t.estimated_value,y=t.existing_supply||t.mint_count,v=t.unique_holders,d=t.concentration_pct,u=t.asp_7d,c=t.asp_30d,h=t.last_sale_price,k=t.total_sales_7d,s=t.total_sales_30d,b=t.total_listings||t.listed_count,x=t.floating_supply_pct,L=t.burn_count,g=t.highest_edition_offer||t.highest_offer,a=t.edition_offer_count,C=t.liquidity_score,M={price:[n("Floor",r(f)),n("Est. Value",r(m)),n("7d Avg",u?r(u):"N/A"),n("30d Avg",c?r(c):"N/A"),n("Last Sale",r(h))].join(""),supply:[n("Supply",y?Number(y).toLocaleString():null),L?n("Burned",Number(L).toLocaleString()):"",n("Listed",b!=null?Number(b).toLocaleString():null),n("Holders",v!=null?Number(v).toLocaleString():null),n("Top Holder",d!=null?`${Number(d).toFixed(1)}%`:null),n("Floating",x!=null?`${Number(x).toFixed(1)}%`:null)].join(""),offers:[n("Top Offer",g?r(g):"N/A"),n("Offers",a?String(a):null),n("Sales (7d)",k!=null?String(k):null),n("Sales (30d)",s!=null?String(s):null),n("Liquidity",C!=null?`${Math.round(C)}/100`:null)].join("")},U=(()=>{if(this.product==="allday"||this.product==="pinnacle"){let E=t.edition_id;return E?`https://vaultopolis.com/analytics/${this.product}/edition/${E}`:"https://vaultopolis.com"}let l=t.setID||t.set_id,p=t.playID||t.play_id;if(!l||!p)return"https://vaultopolis.com";let _=t.subeditionID??t.subedition_id;return _!=null&&_!==0&&_!=="0"?`https://vaultopolis.com/analytics/topshot/edition/${l}/${p}/${_}`:`https://vaultopolis.com/analytics/topshot/edition/${l}/${p}`})(),S=e.querySelector(".vp-pill-body");S.style.cssText="flex:1;display:flex;flex-direction:column;overflow:hidden;",S.innerHTML=`
      <div style="display:flex;gap:0;border-bottom:1px solid rgba(45,45,74,0.8);margin-bottom:2px">
        <button class="vp-pill-tab vp-pill-tab-active" data-tab="price" style="flex:1;padding:5px 0;border:none;background:none;color:#6366f1;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid #6366f1;margin-bottom:-1px;font-family:inherit">Price</button>
        <button class="vp-pill-tab" data-tab="supply" style="flex:1;padding:5px 0;border:none;background:none;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit">Supply</button>
        <button class="vp-pill-tab" data-tab="offers" style="flex:1;padding:5px 0;border:none;background:none;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;font-family:inherit">Offers</button>
      </div>
      <div class="vp-pill-content" style="flex:1;overflow-y:auto;padding:2px 0">${M.price}</div>
      <div style="display:flex;gap:6px;padding-top:6px;border-top:1px solid rgba(45,45,74,0.6);margin-top:4px;flex-shrink:0">
        ${i?`<a href="${P(i)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:#6366f1;color:#fff;border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">View Listing</a>`:""}
        <a href="${P(U)}" target="_blank" rel="noopener" style="flex:1;text-align:center;background:transparent;color:#6366f1;border:1px solid rgba(99,102,241,0.6);border-radius:6px;padding:5px 0;font-size:11px;font-weight:600;text-decoration:none;font-family:inherit;display:block">Full Analytics</a>
      </div>
    `,S.querySelectorAll(".vp-pill-tab").forEach(l=>{l.addEventListener("click",p=>{p.preventDefault(),p.stopPropagation();let _=l.dataset.tab;S.querySelectorAll(".vp-pill-tab").forEach(E=>{E.style.color="#6b7280",E.style.borderBottomColor="transparent"}),l.style.color="#6366f1",l.style.borderBottomColor="#6366f1",S.querySelector(".vp-pill-content").innerHTML=M[_]})})}};var D={topshot:{videos:'.chakra-linkbox video, a[href*="/listings/"] video',images:'.chakra-linkbox img:not([src*="badge"]):not([src*="icon"]):not([src*="tier"]):not([src*="avatar"]):not([class*="avatar"]), a[href*="/listings/"] img:not([src*="badge"]):not([src*="icon"])'},allday:{videos:'a[href*="/listing/moment/"] video, a[href*="/listing/moment/"] ~ video',images:'a[href*="/listing/moment/"] img:not(.chakra-avatar__img):not([src*="badge"]):not([src*="icon"]), a[href*="/listing/moment/"] picture img:not(.chakra-avatar__img)'},pinnacle:{videos:'a[href*="/pin/"] video, a[href*="/collectible/"] video',images:'a[href*="/pin/"] img:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"]), a[href*="/collectible/"] img:not([src*="badge"]):not([src*="icon"]):not([src*="avatar"])'}},N=class{constructor(e){this.site=e,this.sel=D[e]||D.topshot,this._mediaObs=null}init(){this.apply(),chrome.storage.onChanged.addListener(e=>{(e.blockVideos||e.reduceImages||e.blockAllMedia)&&this.apply()})}apply(){chrome.storage.local.get(["blockVideos","reduceImages","blockAllMedia"],e=>{let t=e.blockVideos||e.blockAllMedia||!1,o=e.reduceImages||e.blockAllMedia||!1,i=e.blockAllMedia||!1;this._setCSS("vp-block-videos",t,`${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-reduce-images",o&&!i,`${this.sel.images} { image-rendering: pixelated; filter: contrast(1.05) brightness(0.98); }`),this._setCSS("vp-block-all-media",i,`${this.sel.images} { visibility: hidden !important; opacity: 0 !important; }
         ${this.sel.videos} { visibility: hidden !important; opacity: 0 !important; }`),this._setCSS("vp-overlay-restore",t||o||i,`.vp-pill, .vp-pill * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }
         .vp-pill-overlay, .vp-pill-overlay * { visibility: visible !important; opacity: 1 !important; image-rendering: auto !important; filter: none !important; }`),t?(this._killVideos(),this._mediaObs||(this._mediaObs=new MutationObserver(()=>this._killVideos()),this._mediaObs.observe(document.body,{childList:!0,subtree:!0}))):this._mediaObs&&(this._mediaObs.disconnect(),this._mediaObs=null)})}_setCSS(e,t,o){let i=document.getElementById(e);if(t&&!i){let r=document.createElement("style");r.id=e,r.textContent=o,document.head.appendChild(r)}else!t&&i&&i.remove()}_killVideos(){document.querySelectorAll(this.sel.videos).forEach(e=>{e.pause(),e.removeAttribute("autoplay"),e.preload="none"})}};var $=class{constructor(){this.detector=new I,this.pill=new T("pinnacle"),this.currentUrl=window.location.href,this.processedElements=new WeakSet,this.debounceTimer=null,this.enabled=!0,this.product="pinnacle"}init(){chrome.storage.local.get(["enabled"],e=>{this.enabled=e.enabled!==!1,this.enabled&&(new N("pinnacle").init(),this.pill.init(),chrome.runtime.sendMessage({action:"ensureIndex",market:this.product}),this.watchNavigation(),this.watchDOM(),setTimeout(()=>this.scanPage(),5e3),setTimeout(()=>this.scanPage(),1e4),setTimeout(()=>this.scanPage(),2e4),setTimeout(()=>this.scanPage(),3e4))}),chrome.storage.onChanged.addListener(e=>{e.enabled&&(this.enabled=e.enabled.newValue)})}watchNavigation(){let e=()=>{let i=window.location.href;i!==this.currentUrl&&(this.currentUrl=i,setTimeout(()=>this.scanPage(),800))},t=history.pushState.bind(history),o=history.replaceState.bind(history);history.pushState=(...i)=>{t(...i),e()},history.replaceState=(...i)=>{o(...i),e()},window.addEventListener("popstate",e)}watchDOM(){new MutationObserver(t=>{clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>{t.some(i=>i.addedNodes.length>0||i.type==="attributes")&&this.scanPage()},500)}).observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["href","src","alt"]})}scanPage(){if(this.enabled)for(let{element:e,editionId:t,playerName:o,listingPrice:i}of this.detector.findEditionElements()){if(this.processedElements.has(e))continue;this.processedElements.add(e);let n=(e.tagName==="A"?e:e.querySelector('a[href*="/pin/"]'))?.href||e.href||"";e._vpData={editionId:t,playerName:o,listingPrice:i,listingUrl:n},this.pill.observe(e)}}},A=new $;document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>A.init()):A.init();})();
