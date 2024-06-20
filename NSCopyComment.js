// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @version     0.7
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
  if (delIns.value !== '') {
    delIns.value += '\n\n';
  }
  delIns.value += cstComments;
};

// Create 'add to delivery instructions' button element
const createDelInsBtn = () => {
  const btn = document.createElement("button");
  btn.innerHTML = "Copy Comment<br> to Delivery<br> Instructions";
  btn.style.padding = "3em 2px";
  btn.style.position = "relative";
  btn.style.left = "4px";
  btn.style.bottom = "44px";
  btn.style.backgroundColor = "#e4eaf5";
  btn.addEventListener("mouseenter", (event) => {
    btn.style.backgroundColor = "blue";
  });
  btn.onclick = () => {
    copyToDelIns();
    return false;
  };
  document.querySelector("#custbody_customer_order_comments").after(btn);
};


//Wait until document is sufficiently loaded, then inject button
if (isEd) {
  const disconnect = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custbody_customer_order_comments");

    if (node) {
      createDelInsBtn();

      // disconnect observer
      return true;
    }
  });
};
