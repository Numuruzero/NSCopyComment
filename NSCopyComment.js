// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCopyComment/main/NSCopyComment.js
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @version     1.22
// ==/UserScript==

// Declare const to determine if document is in edit mode
const edCheck = new RegExp('e=T');
const url = window.location.href;
const isEd = edCheck.test(url);

// Function for delivery instructions button to invoke
// Copy text from cst comments to delivery instructions, and add space if text is already present
const copyToDelIns = () => {
  const cstComments = document.querySelector("#custbody_customer_order_comments").value;
  const delIns = document.querySelector("#custbody_pacejet_delivery_instructions");
  if (delIns.value !== '') delIns.value += '\n\n';
  delIns.value += cstComments;
};

// Fade a target over 2 seconds
function fadeOutEffect(target) {
  const fadeTarget = target;
  const fadeEffect = setInterval(() => {
    if (fadeTarget.style.opacity < 0.1) {
      clearInterval(fadeEffect);
    } else {
      fadeTarget.style.opacity -= 0.1;
    }
  }, 150);
};

// Create popup to confirm copy
const popupConfirm = (x, y) => {
  const confPop = document.createElement("div");
  confPop.innerHTML = "Copied!";
  confPop.style.position = "absolute";
  confPop.style.top = `${y-36}px`;
  confPop.style.left = `${x-31}px`;
  confPop.style.backgroundColor = '#fff';
  confPop.style.border = '1px solid #000';
  confPop.style.padding = '10px';
  confPop.style.zIndex = 1000;
  confPop.style.opacity = 1;
  document.body.appendChild(confPop);
  // console.log(confPop.offsetWidth);
  // console.log(confPop.offsetHeight);

  // Fade the popup out
  fadeOutEffect(confPop);

  // And remove it
  setTimeout(() => {
    confPop.remove();

  }, 1500);
};

// Create 'add to delivery instructions' button element
const createDelInsBtn = () => {
  const btn = document.createElement("button");
  let copied = false;
  const btnText = document.createElement("p");
  btnText.innerHTML = "Copy Comment<br> to Delivery<br> Instructions";
  btn.appendChild(btnText);
  btn.style.padding = "3em 2px";
  btn.style.height = "134px";
  btn.style.position = "relative";
  btn.style.display = "inline-flex";
  btn.style.flexWrap = "wrap";
  btn.style.alignContent = "center";
  btn.style.left = "4px";
  btn.style.bottom = "80px";
  btn.style.backgroundColor = "#e4eaf5";
  btn.style.border = "1px solid #508595";
  btn.addEventListener("mouseenter", (event) => {
    btn.style.backgroundColor = "#cddeff";
  });
  btn.addEventListener("mouseleave", (event) => {
    btn.style.backgroundColor = "#e4eaf5";
  });
  btn.addEventListener("mousedown", (event) => {
    btn.style.backgroundColor = "#4b88ff";
  });
  btn.addEventListener("mouseup", (event) => {
    btn.style.backgroundColor = "#cddeff";
  });
  btn.onclick = () => {
    copyToDelIns();
    if (copied == false) {
      btnText.innerHTML += "<br>(Done!)";
      // btn.style.padding = "30px 2px";
      btn.style.bottom = "89px";
    };
    copied = true;
    return false;
  };
  btn.addEventListener("click", (event) => {
    popupConfirm(event.clientX, event.clientY);
  });
  document.querySelector("#custbody_customer_order_comments").after(btn);
};

const checkIP = () => {
    if (document.querySelector("#custbody78_fs_lbl_uir_label")) {
        const findIP = new RegExp(/(?:\d+\.){3}\d+/);
        try {
            const ipATag = isEd ? document.querySelector("#custbody78_fs_lbl_uir_label").nextElementSibling.firstElementChild.firstElementChild.firstElementChild.href : document.querySelector("#custbody78_fs_lbl_uir_label").nextElementSibling.firstElementChild.href;
        } catch (error) {
            console.log(error);
            return;
        }
        const ip = findIP.exec(ipATag)[0];
        console.log(ipATag);
        console.log(ip);
        const url = `https://ipapi.co/${ip}/json/`;
        // w = window.open("",'_blank', 'toolbar=no,titlebar=no,status=no,menubar=no,scrollbars=no,resizable=no,left=12000, top=12000,width=10,height=10,visible=none', ''); w.location.href = url; setTimeout(function() { w.close(); }, 6000)
        fetch(url)
            .then((response) => response.json())
            .then((data) => console.log(data));
    }
};

//Wait until document is sufficiently loaded, then inject button
if (isEd) {
  const disconnect = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custbody_customer_order_comments");

    if (node) {
        createDelInsBtn();
        checkIP();

      // disconnect observer
      return true;
    }
  });
};
