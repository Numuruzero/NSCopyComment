// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/transactionlist.nl*
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCopyComment/main/NSCopyComment.js
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @version     1.41
// ==/UserScript==

/*jshint esversion: 6 */

// Declare const to determine if document is in edit mode
const edCheck = new RegExp('e=T');
const url = window.location.href;
const isEd = edCheck.test(url);

///////////////////////////////////BEGIN TRANSACTION/SEARCH SCRIPTS////////////////////////////////////

// Test if the URL is a transaction search and proceed with relevant scripts
if (url.includes("transactionlist")) {

    colIndex = {
        doc: 4,
        op: 5,
        status: 6,
        memo: 7,
        flags: 12
    };

function open_tabs(urls) {
    urls.forEach((url) => {
        window.open(url);
    });
}
  
// Query selector for "OP in Charge" (last-child span contains name)
//   document.querySelector("#row0 > td:nth-child(6)")
  
// Query selector for "Document #" (child a tag contains link)
// document.querySelector("#row0 > td:nth-child(5)")
  
// Re-using scripts for item table, need to tailor the below
const getRowCount = () => {
    let testRows;
    let lastRow = 0;
    let y = 0;
    testRows = document.querySelector("#row0 > td:nth-child(6)");
    // The lines are written differently in edit mode, so we'll need to account for this while counting rows
    while (testRows) {
        lastRow = y;
        testRows = document.querySelector(`#row${y} > td:nth-child(6)`);
        y++;
    }
    return lastRow;
  }
  
  const getColumnCount = () => {
    let testColumns;
    let lastColumn = 0;
    let x = 1;
    testColumns = document.querySelector("#row0 > td:nth-child(1)");
    while (testColumns) {
        lastColumn = x - 1;
        testColumns = document.querySelector(`#row0 > td:nth-child(${x})`);
        x++;
        }
    return lastColumn;
}
  
const buildOrdersTable = () => {
    const ordersTable = [];
    const totalRows = getRowCount();
    const totalColumns = getColumnCount();
    let currentRow = [];
    let row = 0;
    let column = 1;
    let aRow;
    while (row <= totalRows) {
        currentRow = [];
          while (column <= totalColumns) {
            aRow = document.querySelector(`#row${row} > td:nth-child(${column})`);
            currentRow.push(aRow);
            column++;
          };
        column = 1;
        ordersTable.push(currentRow);
        row++;
    };
    return ordersTable;
}

    const openOrders = () => {
        // const userName = document.querySelector("#uif374").innerHTML;
        // Experimental selector to find user's name
        const userName = document.querySelectorAll('[aria-label="Change Role"]')[0].lastElementChild.lastElementChild.firstElementChild.innerText;
        const tableState = buildOrdersTable();
        console.log(tableState);
        const orderURLs = [];
        for (let i = 0; i <= tableState.length - 1; i++) {
            if (tableState[i][colIndex.op]) {
                if (tableState[i][colIndex.op].innerText == userName) {
                    orderURLs.push(tableState[i][colIndex.doc].lastElementChild.href);
                }
            }
        }
        console.log(orderURLs);
        console.log(tableState[0][5].innerText);
        console.log(userName);
        open_tabs(orderURLs);
}

const makeButton = () => {
    opeb = document.createElement("button");
    opeb.innerHTML = "Open Links";
    opeb.style.marginLeft = "1rem";
    opeb.style.position = "relative";
    opeb.style.top = "5px";
    opeb.onclick = () => {
        openOrders();
        return false;
    }
    // Stuff
    document.querySelector("#body > div > div.uir-page-title-firstline > h1").after(opeb);
}

const tableCheck = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#row0 > td:nth-child(1)");
  
    if (node) {
      // console.log('Building item table')
        makeButton();
  
      // disconnect observer
      return true;
    }
});
    // Return to stop script once we are done with transaction search scripts
    return;
}
////////////////////////////////////END TRANSACTION/SEARCH SCRIPTS/////////////////////////////////////
////////////////////////////////BEGIN SALES ORDER AND ESTIMATE SCRIPTS////////////////////////////////
///////////////////////////////BEGIN DELIVERY INSTRUCTIONS COPY BUTTON///////////////////////////////
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
            const ip = findIP.exec(ipATag)[0];
            console.log(ipATag);
            console.log(ip);
            const url = `https://ipapi.co/${ip}/json/`;
            // w = window.open("",'_blank', 'toolbar=no,titlebar=no,status=no,menubar=no,scrollbars=no,resizable=no,left=12000, top=12000,width=10,height=10,visible=none', ''); w.location.href = url; setTimeout(function() { w.close(); }, 6000)
            fetch(url)
                .then((response) => response.json())
                .then((data) => console.log(data));
        } catch (error) {
            console.log(error);
            return;
        }
    }
};

//Wait until document is sufficiently loaded, then inject button
if (isEd) {
  const disconnect = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custbody_customer_order_comments");

    if (node) {
        createDelInsBtn();
        // checkIP();

      // disconnect observer
      return true;
    }
  });
};

///////////////////////////////END DELIVERY INSTRUCTIONS COPY BUTTON///////////////////////////////
/////////////////////////////////////BEGIN FRAUD CHECK TOOLS//////////////////////////////////////

const bTreeTab = document.querySelector("#custom189_div") ? document.querySelector("#custom189_div") : 'NA';

const cst = {
    bill: {
        name: 'N/A',
        company: 'N/A',
        street: 'N/A',
        suite: 'N/A',
        csz: 'N/A',
        city: 'N/A',
        state: 'N/A',
        zip: 'N/A',
        country: 'N/A',
        phone: 'N/A'
    },
    ship: {
        name: 'N/A',
        company: 'N/A',
        street: 'N/A',
        suite: 'N/A',
        csz: 'N/A',
        city: 'N/A',
        state: 'N/A',
        zip: 'N/A',
        country: 'N/A',
        phone: 'N/A'
    }
};

const ifNA = (arg) => {
    arg == 'N/A' ? true : false;
}

const parseAddress = () => {
    try {
        const billphone = isEd ? document.querySelector("#custbodybilling_phone_number").value : document.querySelector("#custbodybilling_phone_number_fs_lbl_uir_label").nextElementSibling.innerText;
        const shipphone = isEd ? document.querySelector("#custbodyshipphonenumber").value : document.querySelector("#custbodyshipphonenumber_fs_lbl_uir_label").nextElementSibling.innerText;
        cst.bill.phone = billphone;
        cst.ship.phone = shipphone;
    } catch (error) {
        console.log(error);
    }
    const shipAddress = isEd ? document.querySelector("#shipaddress").innerHTML : document.querySelector("#shipaddress_fs_lbl_uir_label").nextElementSibling.innerText;
    const billAddress = isEd ? document.querySelector("#billaddress").innerHTML : document.querySelector("#billaddress_fs_lbl_uir_label").nextElementSibling.innerText;
    const shipArray = shipAddress.split('\n');
    const billArray = billAddress.split('\n');
    const streetReg = new RegExp(/^\d+/);
    const suiteReg = new RegExp(/^(Unit|Suite|Ste|Fl|Apt) /i);
    const cszReg = new RegExp(/\w{2} \d{5}/);
    const countryReg = new RegExp(/Map$/);
    const breakCSZ = new RegExp(/(?<city>[\w ]*) (?<state>\w{2}) (?<zip>\d{5})-*(?<zip4>\d{0,4})/)
    let currentSearch = 'Ship-to';
    shipArray.forEach((element, index) => {
        switch (true) {
            case streetReg.test(element):
                console.log(`Street address (${currentSearch}) found on line ${index + 1}`);
                cst.ship.street = element;
                break;
            case suiteReg.test(element):
                console.log(`Suite number (${currentSearch}) found on line ${index + 1}`);
                cst.ship.suite = element;
                break;
            case cszReg.test(element):
                console.log(`City/State/Zip (${currentSearch}) found on line ${index + 1}`);
                const csz = breakCSZ.exec(element);
                cst.ship.city = csz.groups.city;
                cst.ship.state = csz.groups.state;
                cst.ship.zip = csz.groups.zip;
                break;
            case countryReg.test(element):
                console.log(`Country (${currentSearch}) found on line ${index + 1}`);
                cst.ship.country = element.replace("Map","").trim();
                break;
            default:
                if (index == 1) {
                    console.log(`Company (${currentSearch}) found on line ${index + 1}`);
                    cst.ship.company = element;
                } else if (index == 0) {
                    console.log(`Customer (${currentSearch}) found on line ${index + 1}`);
                    cst.ship.name = element;
                } else {
                    console.log(`No matches found for ${element}`);
                }
                break;
        }
    });
    currentSearch = 'Bill-to';
    billArray.forEach((element, index) => {
        switch (true) {
            case streetReg.test(element):
                console.log(`Street address (${currentSearch}) found on line ${index + 1}`);
                cst.bill.street = element;
                break;
            case suiteReg.test(element):
                console.log(`Suite number (${currentSearch}) found on line ${index + 1}`);
                cst.bill.suite = element;
                break;
            case cszReg.test(element):
                console.log(`City/State/Zip (${currentSearch}) found on line ${index + 1}`);
                const csz = breakCSZ.exec(element);
                cst.bill.city = csz.groups.city;
                cst.bill.state = csz.groups.state;
                cst.bill.zip = csz.groups.zip;
                break;
            case countryReg.test(element):
                console.log(`Country (${currentSearch}) found on line ${index + 1}`);
                cst.bill.country = element.replace("Map","").trim();
                break;
            default:
                if (index == 1) {
                    console.log(`Company (${currentSearch}) found on line ${index + 1}`);
                    cst.bill.company = element;
                } else if (index == 0) {
                    console.log(`Customer (${currentSearch}) found on line ${index + 1}`);
                    cst.bill.name = element;
                } else {
                    console.log(`No matches found for ${element}`);
                }
                break;
        }
    });
    cst.bill.csz = `${cst.bill.city} ${cst.bill.state} ${cst.bill.zip}`;
    cst.ship.csz = `${cst.ship.city} ${cst.ship.state} ${cst.ship.zip}`;
}

/**
 * 
 * @param {string} platform - The platform on which the search will be performed. Currently: TruePeopleSearch, FastPeopleSearch, Google
 * @param {string} type - The mode of search. Currently: phone, address, name, general
 * @param {string} term1 - 
 * @param {string} term2 
 * @param {string} term3 
 * @returns 
 */
const buildSearchLink = (platform, type, term1, term2, term3) => {
    return;
}

const createFraudFrame = () => {
    const fraudFrame = document.createElement("iframe");
    fraudFrame.id = 'FraudFrame';
    fraudFrame.title = 'Fraud Info';
    fraudFrame.style.width = '1140px';
    fraudFrame.style.height = '305px';
    fraudFrame.style.marginTop = '10px';
    fraudFrame.style.resize = 'both';
    fraudFrame.style.overflow = 'auto';
    return fraudFrame;
}

const createSearchLinks = () => {
    const links = {
        providers: {
            tps: "TruePeopleSearch",
            fps: "FastPeopleSearch",
            gle: "Google Search",
            li: "LinkedIn Search"
        },
        icons: {
            tps: "https://play-lh.googleusercontent.com/aNUH0g2ASIp8tN9OnJpccMxQJDkZLPxrKWhw2OnGkDNA2WLePAOU9iWSXkSt5P3OY_0=w240-h480-rw",
            fps: "https://www.officecoffeesolutions.com/assets/graphics/img/sustainability/grid/community.jpg",
            gle: "https://cdn-icons-png.flaticon.com/512/3128/3128287.png",
            li: "https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png"
        },
        bill: {
            html: "",
            titles: ["Phone Number", "Street/Suite + City/State/Zip", "Customer Name + City/State/Zip", "Customer Name + Company"],
            results: [cst.bill.phone, `${cst.bill.street}${cst.bill.suite == 'N/A' ? "" : ` ${cst.bill.suite}`} + ${cst.bill.csz}`, `${cst.bill.name} + ${cst.bill.csz}`, `${cst.bill.name} + ${cst.bill.company}`],
            tps: [`https://www.truepeoplesearch.com/resultphone?phoneno=${cst.bill.phone}`, `https://www.truepeoplesearch.com/resultaddress?streetaddress=${cst.bill.street}&citystatezip=${cst.bill.csz}`, `https://www.truepeoplesearch.com/results?name=${cst.bill.name}&citystatezip=${cst.bill.csz}`, `NA`],
            fps: [`https://www.fastpeoplesearch.com/${cst.bill.phone}`, `https://www.fastpeoplesearch.com/address/${cst.bill.street}_${cst.bill.csz}`, `https://www.fastpeoplesearch.com/name/${cst.bill.name}_${cst.bill.csz}`, `NA`],
            gle: [`https://www.google.com/search?q=${cst.bill.phone}`, `https://www.google.com/search?q=${cst.bill.street.replaceAll(' ', '+')}+${cst.bill.csz.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.bill.name.replaceAll(' ', '+')}+${cst.bill.csz.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.bill.name.replaceAll(' ', '+')}+${cst.bill.company.replaceAll(' ', '+')}`],
            li: [`NA`, `NA`, `NA`, `https://www.linkedin.com/search/results/all/?keywords=${cst.bill.name} ${cst.bill.company}&origin=GLOBAL_SEARCH_HEADER`]
        },
        ship: {
            html: "",
            titles: ["Phone Number", "Street/Suite + City/State/Zip", "Customer Name + City/State/Zip", "Customer Name + Company"],
            results: [cst.ship.phone, `${cst.ship.street}${cst.ship.suite == 'N/A' ? "" : ` ${cst.ship.suite}`} + ${cst.ship.csz}`, `${cst.ship.name} + ${cst.ship.csz}`, `${cst.ship.name} + ${cst.ship.company}`],
            tps: [`https://www.truepeoplesearch.com/resultphone?phoneno=${cst.ship.phone}`, `https://www.truepeoplesearch.com/resultaddress?streetaddress=${cst.ship.street}&citystatezip=${cst.ship.csz}`, `https://www.truepeoplesearch.com/results?name=${cst.ship.name}&citystatezip=${cst.ship.csz}`, `NA`],
            fps: [`https://www.fastpeoplesearch.com/${cst.ship.phone}`, `https://www.fastpeoplesearch.com/address/${cst.ship.street}_${cst.ship.csz}`, `https://www.fastpeoplesearch.com/name/${cst.ship.name}_${cst.ship.csz}`, `NA`],
            gle: [`https://www.google.com/search?q=${cst.ship.phone}`, `https://www.google.com/search?q=${cst.ship.street.replaceAll(' ', '+')}+${cst.ship.csz.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.ship.name.replaceAll(' ', '+')}+${cst.ship.csz.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.ship.name.replaceAll(' ', '+')}+${cst.ship.company.replaceAll(' ', '+')}`],
            li: [`NA`, `NA`, `NA`, `https://www.linkedin.com/search/results/all/?keywords=${cst.ship.name} ${cst.ship.company}&origin=GLOBAL_SEARCH_HEADER`]
        },
        hybrid: {
            html: "",
            titles: ["Bill Name + Ship Name", "Ship Name + Bill Company", "Bill Name + Ship Company", "Ship Name + Bill City/State/Zip", "Bill Name + Ship City/State/Zip"],
            results: [`${cst.bill.name} + ${cst.ship.name}`, `${cst.ship.name} + ${cst.bill.company}`, `${cst.bill.name} + ${cst.ship.company}`, `${cst.ship.name} + ${cst.bill.csz}`, `${cst.bill.name} + ${cst.ship.csz}`],
            tps: [`NA`, `NA`, `NA`, `https://www.truepeoplesearch.com/results?name=${cst.ship.name}&citystatezip=${cst.bill.csz}`, `https://www.truepeoplesearch.com/results?name=${cst.bill.name}&citystatezip=${cst.ship.csz}`],
            fps: [`NA`, `NA`, `NA`, `https://www.fastpeoplesearch.com/name/${cst.ship.name}_${cst.bill.csz}`, `https://www.fastpeoplesearch.com/name/${cst.bill.name}_${cst.ship.csz}`],
            gle: [`https://www.google.com/search?q=${cst.bill.name.replaceAll(' ', '+')}+${cst.ship.name.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.ship.name.replaceAll(' ', '+')}+${cst.bill.company.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.bill.name.replaceAll(' ', '+')}+${cst.ship.company.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.ship.name.replaceAll(' ', '+')}+${cst.bill.csz.replaceAll(' ', '+')}`, `https://www.google.com/search?q=${cst.bill.name.replaceAll(' ', '+')}+${cst.ship.csz.replaceAll(' ', '+')}`],
            li: [`NA`, `https://www.linkedin.com/search/results/all/?keywords=${cst.ship.name} ${cst.bill.company}&origin=GLOBAL_SEARCH_HEADER`, `https://www.linkedin.com/search/results/all/?keywords=${cst.bill.name} ${cst.ship.company}&origin=GLOBAL_SEARCH_HEADER`, `NA`, `NA`]
        }
    }
    let ahtml = "";
    // For loop, we'll just use the highest number of results for a given type
    for (let i = 0; i < 5; i++) {
        // Each loop is going through one "results" header and checking each provider for a valid link
        const provider = ["tps", "fps", "gle", "li"];
        // Set a variable for dynamic object access
        let type = "bill";
        ahtml = "";
        // Check if there are any null fields in the current search attempt and discard if so
        if (i <= links[type].titles.length - 1) {
            if (!links[type].results[i].includes('N/A')) {
                provider.forEach((prdr) => {
                    if (links[type][prdr][i] != 'NA') {
                        ahtml += `<a href="${links[type][prdr][i]}" target="_blank" > <img src="${links.icons[prdr]}" alt="${links.providers[prdr]}" title="${links.providers[prdr]}" /> </a>`
                    }
                });
                links[type].html += `<div class="search"> <div class="term inline"> <p class="bold">${links[type].titles[i]}:</p> <p> ${links[type].results[i]} </p> </div> <div class="links"> ${ahtml} </div> </div>`
            }
        }
        // Reset the temporary html build and go through shipping results
        ahtml = "";
        type = "ship";
        if (i <= links[type].titles.length - 1) {
            if (!links[type].results[i].includes('N/A')) {
                provider.forEach((prdr) => {
                    if (links[type][prdr][i] != 'NA') {
                        ahtml += `<a href="${links[type][prdr][i]}" target="_blank" > <img src="${links.icons[prdr]}" alt="${links.providers[prdr]}" title="${links.providers[prdr]}" /> </a>`
                    }
                });
                links[type].html += `<div class="search"> <div class="term inline"> <p class="bold">${links[type].titles[i]}:</p> <p> ${links[type].results[i]} </p> </div> <div class="links"> ${ahtml} </div> </div>`
            }
        }
        // Reset one last time and go through hybrid results
        ahtml = "";
        type = "hybrid";
        if (i <= links[type].titles.length - 1) {
            if (!links[type].results[i].includes('N/A')) {
                provider.forEach((prdr) => {
                    if (links[type][prdr][i] != 'NA') {
                        ahtml += `<a href="${links[type][prdr][i]}" target="_blank" > <img src="${links.icons[prdr]}" alt="${links.providers[prdr]}" title="${links.providers[prdr]}" /> </a>`
                    }
                });
                links[type].html += `<div class="search"> <div class="term inline"> <p class="bold">${links[type].titles[i]}:</p> <p> ${links[type].results[i]} </p> </div> <div class="links"> ${ahtml} </div> </div>`
            }
        }
        
    }
    return links;
}

const loadCheck = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custom189_div");
  
    if (node) {
        parseAddress();
        const links = createSearchLinks();
        // We are lazy and let the browser figure out that a space in a link is the same as %20
        const html = `<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8" /> <meta name="viewport" content="width=device-width, initial-scale=1.0" /> <title>Fraud Checking</title> </head> <body> <style> #fraudlinks { display: flex; /* flex-wrap: wrap; */ /* align-content: center; */ justify-content: center; margin-top: 20px; } #addressinfo { display: flex; flex-wrap: wrap; align-content: center; justify-content: center; } #billtodetails { display: inline-block; border: 1px solid black; } #shiptodetails { display: inline-block; border: 1px solid black; margin-left: 12px; } .container { width: auto; min-width: 246px; margin: 0px 6px; padding: 3px 6px; border: 1px solid black; } .result.container { width: 33%; min-width: 165px; } .search { display: flex; flex-wrap: wrap; justify-content: space-between; width: auto; margin: 0px 6px; padding: 3px 6px; } .term { margin-right: 30px; } .links { display: inline-block; flex-wrap: wrap; align-content: center; } .bold { font-weight: 600; } .inline { display: inline; } h3 { margin-top: 0px; align-self: center; justify-content: center; text-align: center; } img { height: 32px; width: 32px; } a { text-decoration: none; } </style> <div id="addressinfo"> <div id="billtodetails" class="container"> <h3>Bill-to Address Details:</h3> <p class="bold inline">Customer Contact:</p> <p class="inline">${cst.bill.name}</p> <br /> <p class="bold inline">Company:</p> <p class="inline">${cst.bill.company}</p> <br /> <p class="bold inline">Street Address:</p> <p class="inline">${cst.bill.street}</p> <br /> <p class="bold inline">Suite:</p> <p class="inline">${cst.bill.suite}</p> <br /> <p class="bold inline">City:</p> <p class="inline">${cst.bill.city}</p> <br /> <p class="bold inline">State:</p> <p class="inline">${cst.bill.state}</p> <br /> <p class="bold inline">Zip:</p> <p class="inline">${cst.bill.zip}</p> <br /> <p class="bold inline">Country:</p> <p class="inline">${cst.bill.country}</p> <br /> </div> <div id="shiptodetails" class="container"> <h3>Ship-to Address Details:</h3> <p class="bold inline">Customer Contact:</p> <p class="inline">${cst.ship.name}</p> <br /> <p class="bold inline">Company:</p> <p class="inline">${cst.ship.company}</p> <br /> <p class="bold inline">Street Address:</p> <p class="inline">${cst.ship.street}</p> <br /> <p class="bold inline">Suite:</p> <p class="inline">${cst.ship.suite}</p> <br /> <p class="bold inline">City:</p> <p class="inline">${cst.ship.city}</p> <br /> <p class="bold inline">State:</p> <p class="inline">${cst.ship.state}</p> <br /> <p class="bold inline">Zip:</p> <p class="inline">${cst.ship.zip}</p> <br /> <p class="bold inline">Country:</p> <p class="inline">${cst.ship.country}</p> <br /> </div> </div> <div id="fraudlinks"> <div class="result container"> <h3>Bill-to Address Searches</h3> ${links.bill.html} </div> <div class="result container"> <h3>Hybrid Searches</h3> ${links.hybrid.html} </div> <div class="result container"> <h3>Ship-to Address Searches</h3> ${links.ship.html} <!-- <div class="search"> <div class="term inline"> <p class="bold">Street/Suite + City/State/Zip:</p> <p> ${cst.ship.street} ${cst.ship.suite == 'N/A' ? '' : cst.ship.suite} ${cst.ship.city} ${cst.ship.state} ${cst.ship.zip} </p> </div> <div class="links"> <a href="https://www.truepeoplesearch.com/resultaddress?streetaddress=${cst.ship.street} ${cst.ship.suite == 'N/A' ? '' : cst.ship.suite}&citystatezip=${cst.ship.city} ${cst.ship.state} ${cst.ship.zip}" target="_blank" > <img src="https://play-lh.googleusercontent.com/aNUH0g2ASIp8tN9OnJpccMxQJDkZLPxrKWhw2OnGkDNA2WLePAOU9iWSXkSt5P3OY_0=w240-h480-rw" alt="TruePeopleSearch" title="TruePeopleSearch" /> </a> </div> </div> --> </div> </div> </body> </html>`;
        const fraudFrame = createFraudFrame();
        bTreeTab.before(fraudFrame);
        fraudFrame.contentWindow.document.open();
        fraudFrame.contentWindow.document.write(html);
        fraudFrame.contentWindow.document.close();
  
      // disconnect observer
      return true;
    }
});
