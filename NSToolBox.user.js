// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/transactionlist.nl*
// @match       https://1206578.app.netsuite.com/app/crm/support/supportcase.nl*
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCopyComment/main/NSToolBox.user.js
// @grant       GM.setValue
// @grant       GM.getValue
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @require     https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js
// @version     1.56
// ==/UserScript==

/*jshint esversion: 6 */

// Declare const to determine if document is in edit mode
const edCheck = new RegExp('e=T');
const pcsCheck = new RegExp('pcs=T');
const url = window.location.href;
const isEd = edCheck.test(url);
const isPcs = pcsCheck.test(url);

// Determine if record is estimate
const estCheck = new RegExp(/estimate\.nl/);
const isEST = estCheck.test(url);

const perfDebug = false;

function debug(stuff) {
    if (perfDebug) {
        console.log(stuff);
    }
}

// TODO: Add dot to order tab name if it has been observed

// New simpler function to capture table data as 2D array
// Does not care if the table is in edit mode or not, but may return empty rows if in edit mode
// Modified from other scripts to push the actual elements
function captureTableData(tableElement, textOnly = false) {
    const rows = tableElement.querySelectorAll("tr");
    const data = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll("td,th");
        const rowData = [];
        cols.forEach(col => {
            rowData.push(textOnly ? col.textContent.trim() : col);
        });
        data.push(rowData);
    });
    return data;
}

///////////////////////////////////BEGIN TRANSACTION/SEARCH SCRIPTS////////////////////////////////////

// TODO: Add more flag types, make it easier to add flags
// TODO: Make the sort list collapsible and consider if it should be collapsed by default
// Test if the URL is a transaction search and proceed with relevant scripts
if (url.includes("transactionlist")) {

    let colIndex = { // Similar to itmCol, eventually stores column names.
        doc: "DOCUMENT #",
        op: "OP IN CHARGE",
        status: "STATUS",
        memo: "MEMO",
        flags: "MAJOR FLAGS",
        set: false
    };


    // Important note: the browser may block pop-ups if opening multiple tabs. The user can either click the "Pop Ups Blocked" notification in the URL bar and allow them, or on Chrome navigate to Settings > Privacy and security > Site settings > Pop-ups and redirects (chrome://settings/content/popups) and then add NetSuite
    function open_tabs(urls, sos) {
        urls.forEach((url, soIndex) => {
            // debug(`Opening ${url}`);
            // window.open(url);
            // Experimentally opening a tab with a preload URL so we don't actually load all the pages at once
            //////////////////////////////////////////////
            console.log(`Opening holding tab for ${url}`);

            // Open a blank new tab
            const tab = window.open('', '_blank');

            // Check if the browser's popup blocker prevented the tab from opening
            if (tab) {
                // Inject the holding page HTML and logic into the new tab
                tab.document.write(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Standby${sos ? ' ' + sos[soIndex] : '...'}</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background-color: #f9f9f9;
      }
      .message {
        text-align: center;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="message">
      <h2>Tab Inactive</h2>
      <p>The content will load when you view this tab.</p>
    </div>
    <script>
      const targetUrl = "${url}";

      function loadTarget() {
        // If the user is currently looking at the tab, load the URL
        if (document.visibilityState === "visible") {
          // Using .replace() means this holding page won't clog up the user's "Back" button history
          // Wait a short time before performing the redirect so the initial opening phase doesn't trigger it
          setTimeout(() => {
            if (document.visibilityState === "visible") {
              window.location.replace(targetUrl);
            }
          }, 500);
        }
      }

      // Fire immediately in case the browser focuses the new tab right away
      loadTarget();

      // Listen for the user switching to this tab
      document.addEventListener("visibilitychange", loadTarget);
    </script>
  </body>
</html>
`
                );

                // Close the document stream so the browser finishes rendering the holding page
                tab.document.close();

            } else {
                console.warn(`Popup blocked for ${url}. Please allow popups for this site.`);
            }
        });
    }

    // Query selector for "OP in Charge" (last-child span contains name)
    //   document.querySelector("#row0 > td:nth-child(6)")

    // Query selector for "Document #" (child a tag contains link)
    // document.querySelector("#row0 > td:nth-child(5)")

    // Query selector for headers
    // document.querySelector("#div__lab1")

    // Build an array out of the table
    const buildOrdersTable = () => { // Truthfully this is basically redundant but it neatly encapsulates the index setting process
        const orderTable = captureTableData(document.querySelector("#div__body"));
        // Make sure headers are in uppercase (NS inconsistently uses sentence case)
        orderTable[0] = orderTable[0].map(header => header.innerText.toUpperCase().trim());
        if (!colIndex.set) {
            for (key in colIndex) {
                const hdrIndex = orderTable[0].indexOf(colIndex[key]);
                if (hdrIndex != -1) {
                    colIndex[key] = hdrIndex;
                } else if (key != "set") {
                    console.log(`Header ${key} not found`)
                }
                colIndex.set = true;
            }
        }

        return orderTable;
    }

    // Flag totals will be set only for orders with (any) OP (change this?)
    // defOrder property will determine default order in sorting list (can be changed by dragging list items, but will reset on refresh)
    // Text property is what the script looks for in the "Major Flags" column to determine if an order has that flag
    let flagTotals = {
        "All": { count: 0, text: "ThisistheAllType", liid: "liall", defOrder: 0, btnText: "Open All Assigned" },
        "Expedited": { count: 0, text: "Expedited", liid: "liexp", defOrder: 1, btnText: "Open Expedited Orders" },
        "Comment": { count: 0, text: "Comment", liid: "licmt", defOrder: 2, btnText: "Open Comments" },
        "Tax Exempt": { count: 0, text: "Tax Exempt", liid: "litax", defOrder: 3, btnText: "Open Tax Exempts" },
        "Shipquote Failed": { count: 0, text: "Shipquote Failed", liid: "lishipf", defOrder: 4, btnText: "Open Shipquote Failed" },
        "Sales Rep": { count: 0, text: "Sales Rep:", liid: "lisr", defOrder: 5, btnText: "Open Sales Rep" },
        "$0 Order": { count: 0, text: "$0 Order", liid: "lizer", defOrder: 6, btnText: "Open $0 Orders" },
        "Address Validation": { count: 0, text: "Address Validation", liid: "liadd", defOrder: 7, btnText: "Open Address Validation" },
        "Short Address": { count: 0, text: "Address Line 1", liid: "lishort", defOrder: 8, btnText: "Open Short Address" },
        "Low Gross Profit": { count: 0, text: "Low Gross Profit", liid: "lilgr", defOrder: 9, btnText: "Open Low Gross Profit" },
        "LOA Needed": { count: 0, text: "(LOA) Needed", liid: "liloa", defOrder: 10, btnText: "Open LOA Needed" },
        "Outside US48": { count: 0, text: "Outside the US48", liid: "lius48", defOrder: 11, btnText: "Open !US48s" },
        "None": { count: 0, text: " \n", liid: "linon", defOrder: 12, btnText: "Open No Flags" },
        "Other": { count: 0, text: "Other", liid: "lioth", defOrder: 13, btnText: "Open Other Flags" },
        "Fraud Review": { count: 0, text: "Fraud Review:", liid: "lifraud", defOrder: 14, btnText: "Open Fraud Orders" },
        reset() {
            for (flag in this) {
                this[flag].count = 0;
            }
        }
    }

    // GM_setValue("flagTotals", JSON.stringify(flagTotals)); // This is used to store the flag totals for access across functions, since some are called by event listeners
    // console.log(GM_getValue("flagTotals"));
    // (async () => {
    //     // Storing a value
    //     await GM.setValue("flagTotals", JSON.stringify(flagTotals));

    //     // Retrieving the value later
    //     const name = await GM.getValue("flagTotals");
    //     console.log(name); // Output: ScriptCatUser
    // })();

    const readOrders = () => { // Defines a class for Orders and then stores order info based on the generated table
        function Order() {
            this.so = "";
            this.url = "";
            this.op = "";
            this.memo = "";
            this.flags = {
                text: "",
                types: [],
                setFlagTypes: function () {
                    for (let key in flagTotals) {
                        if (this.text.includes(flagTotals[key].text)) {
                            this.types.push(key);
                        }
                    }
                    if (this.types.length == 0) {
                        this.types.push("Other");
                    }
                }
            }
        }

        const tableState = buildOrdersTable();
        debug(tableState);
        let orderInfo = [];
        let thisSO;
        for (let i = 0; i <= tableState.length - 1; i++) {
            try {
                debug(tableState[i][colIndex.doc]);
                thisSO = new Order();
                thisSO.so = tableState[i][colIndex.doc].firstElementChild.innerHTML;
                thisSO.url = tableState[i][colIndex.doc].firstElementChild.href;
                thisSO.op = tableState[i][colIndex.op].textContent;
                thisSO.memo = tableState[i][colIndex.memo].textContent;
                thisSO.flags.text = tableState[i][colIndex.flags].textContent;
                thisSO.flags.setFlagTypes();
                orderInfo.push(thisSO);
            } catch (error) {
                debug(error);
            }
        }
        // flagTotals.flagTypes.forEach((type) => {

        // })
        return orderInfo;
    }

    const openOrders = (scope) => {
        // const userName = document.querySelector("#uif374").innerHTML;
        // Experimental selector to find user's name
        const userName = document.querySelectorAll('[aria-label="Change Role"]')[0].lastElementChild.lastElementChild.firstElementChild.innerText;
        const tableState = readOrders();
        const flagOrder = [];
        // Get the list of flags currently selected with Username as evidenced by the sort list
        document.querySelector("#flaglist").childNodes.forEach((node) => {
            flagOrder.push(node.flagType);
        });
        debug(tableState);
        const orderURLs = [];
        const orderSOs = [];
        switch (scope) {
            case "All":
                // Foreach flag types, loop through all orders
                console.log(tableState);
                // Reverse the flag order
                flagOrder.reverse().forEach((type) => {
                    for (let j = 0; j <= tableState.length - 1; j++) {
                        // We're only looking for the first flag, since we might otherwise open an order multiple times?
                        // Idea: reverse the order of the flagOrder, find if they are included in the flag list at all and remove from tablestate, then reverse orderURLs so the "worst" flags are always pushed out last
                        if (tableState[j].op == userName && tableState[j].flags.types.includes(type)) {
                            orderURLs.push(tableState[j].url);
                            orderSOs.push(tableState[j].so);
                            tableState.splice(j, 1);
                            j--;
                        }
                    };
                })
                orderURLs.reverse(); // This is to make sure the "worst" flags are opened first, since they're pushed last
                orderSOs.reverse();
                break;
            // Otherwise, just loop through orders and open ones that match the selected scope
            default:
                for (let i = 0; i <= tableState.length - 1; i++) {
                    if (tableState[i].op == userName && tableState[i].flags.types.includes(scope)) {
                        orderURLs.push(tableState[i].url);
                        orderSOs.push(tableState[i].so);
                    }
                }
                break;
        }
        debug(orderURLs);
        debug(userName);
        debug(orderSOs);
        open_tabs(orderURLs, orderSOs);
    }

    const countOrders = () => {
        const userName = document.querySelectorAll('[aria-label="Change Role"]')[0].lastElementChild.lastElementChild.firstElementChild.innerText;
        const curTable = readOrders();
        flagTotals.reset(); // We're resetting the flagTotals each time to make sure the count is up to date.
        for (let i = 0; i <= curTable.length - 1; i++) {
            if (curTable[i].op == userName) {
                curTable[i].flags.types.forEach((flag) => {
                    flagTotals[flag].count++
                });
                flagTotals["All"].count++;
            }
        }
        debug(flagTotals);
    }


    // Helper function to add listeners since adding them above applies only to last button
    const controller = new AbortController();
    function addListeners(button) {
        const listenOptions = { signal: controller.signal }
        button.addEventListener("mouseenter", (event) => {
            button.style.backgroundColor = "#8bb3d5"
        }, listenOptions);
        button.addEventListener("mouseleave", (event) => {
            button.style.backgroundColor = "#b2d3ef"
        }, listenOptions);
        button.addEventListener("mousedown", (event) => {
            button.style.backgroundColor = "#4b88ff";
        }, listenOptions);
        button.addEventListener("mouseup", (event) => {
            button.style.backgroundColor = "#cddeff";
        }, listenOptions);
    }

    // Global variables for manipulation across functions
    let allBtns;
    let btnAll;
    let allLis;

    const makeButtons = () => {
        const selectorHTML = `<ul id="flaglist" style="padding-left: 12px; margin-right: 12px"> <li id="lifraud" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Fraud Review </li> <li id="licmt" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Comment </li> <li id="litax" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Tax Exempt </li> <li id="liadd" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Address Validation </li> <li id="lisr" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Sales Rep </li> <li id="lilgr" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Low Gross Profit </li> <li id="lizer" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > $0 Order </li> <li id="lius48" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > Outside US48 </li> <li id="linon" style=" list-style-type: decimal; border: 1px solid black; border-radius: 10px; text-align: center; padding: 2px 4px; margin: 2px 0px; font-size: 8px; width: 85px; cursor: move; cursor: -webkit-grabbing; " > None </li> </ul>`;
        const selector = document.createElement("div");
        selector.style.display = "inline-block";
        const selectorUL = document.createElement("ul");
        selectorUL.id = "flaglist";
        selectorUL.style.paddingLeft = "12px";
        selectorUL.style.marginRight = "12px";
        const btnContainer = document.createElement("div");
        btnContainer.style.backgroundColor = "#f0f8ff";
        btnContainer.style.display = "inline-flex";
        btnContainer.style.padding = "10px";
        btnContainer.style.border = "2px solid #7595cc";
        btnContainer.style.position = "absolute";
        btnContainer.style.top = "54px";
        btnContainer.style.left = "30px";
        // Finish container
        const otherBtnContainer = document.createElement("div");
        otherBtnContainer.style.backgroundColor = "#bbd9f3";
        otherBtnContainer.style.display = "inline-flex";
        otherBtnContainer.style.flexWrap = "wrap";
        otherBtnContainer.style.maxWidth = "79vw";
        otherBtnContainer.style.justifyContent = "center";
        otherBtnContainer.style.padding = "10px";
        otherBtnContainer.style.border = "2px solid #7595cc";
        otherBtnContainer.id = "otherbtns";
        const collapseOtherBtns = document.createElement("button");
        collapseOtherBtns.innerHTML = ">";
        collapseOtherBtns.style.backgroundColor = "#b2d3ef";
        collapseOtherBtns.style.marginLeft = "10px";
        collapseOtherBtns.style.border = "2px solid #4f5c7b";
        collapseOtherBtns.style.height = "42px";
        collapseOtherBtns.style.alignSelf = "center";
        collapseOtherBtns.onclick = () => {
            otherBtnContainer.style.display = otherBtnContainer.style.display === "none" ? "inline-flex" : "none";
            collapseOtherBtns.innerHTML = otherBtnContainer.style.display === "none" ? "^" : ">";
        };
        // Make table to check flags for
        const flagTable = readOrders();
        const flagList = [];
        for (let i = 0; i <= flagTable.length - 1; i++) {
            try {
                flagTable[i].flags.types.forEach((flag) => {
                    flagList.push(flag);
                });
            } catch (error) {
                debug(error);
            }
        }
        debug(flagList);

        // Function to create list items for sorting list
        function createListItem(text, id, scope, defaultNum) {
            const li = document.createElement("li");
            li.flagType = scope;
            li.innerHTML = text;
            li.id = id;
            li.defOrder = defaultNum;
            li.style.listStyleType = "decimal";
            li.style.border = "1px solid black";
            li.style.borderRadius = "10px";
            li.style.textAlign = "center";
            li.style.padding = "2px 4px";
            li.style.margin = "2px 0px";
            li.style.fontSize = "8px";
            li.style.width = "85px";
            li.style.cursor = "move";
            li.style.cursor = "-webkit-grabbing";
            if (!flagList.includes(scope) && scope != "None") {
                li.style.display = "none";
            }
            return li;
        }

        // The order here will determine default order
        allLis = [];
        for (let key in flagTotals) {
            if (key != "reset" && key != "All") {
                const li = createListItem(key, flagTotals[key].liid, key, flagTotals[key].defOrder);
                allLis.push(li);
            }
        }
        allLis.sort((a, b) => a.defOrder - b.defOrder);

        allLis.forEach((listem) => {
            selectorUL.appendChild(listem);
        });
        selector.appendChild(selectorUL);

        // Function to create buttons below and keep style standard
        function createButton(text, scope) {
            const btn = document.createElement("button");
            btn.textIn = text;
            btn.flagType = scope;
            const countp = document.createElement("p");
            countp.innerHTML = `${text} (${flagTotals[scope].count})`;
            btn.style.backgroundColor = "#b2d3ef";
            btn.style.marginLeft = "10px";
            btn.style.border = "2px solid #4f5c7b";
            btn.style.height = "42px";
            btn.style.alignSelf = "center";
            btn.id = `opbtn${scope.replaceAll(" ", "-")}`
            if (!flagList.includes(scope) && scope != "All" && scope != "None") {
                btn.style.display = "none";
            }
            btn.onclick = () => {
                openOrders(scope);
                return false;
            }
            btn.appendChild(countp);
            return btn;
        }

        btnAll = createButton("Open All Assigned", "All");
        // Default behavior is to set display to none if there are no "scope" orders in the list; no orders will be "All"
        btnAll.style.marginLeft = "0px";
        btnAll.style.marginRight = "6px";
        allBtns = [];
        for (let key in flagTotals) {
            if (key != "reset" && key != "All") {
                allBtns.push(createButton(flagTotals[key].btnText, key));
            }
        }
        allBtns.forEach((button) => {
            otherBtnContainer.appendChild(button);
            addListeners(button);
        });
        btnContainer.id = "btncontrol";
        btnContainer.appendChild(selector);
        btnContainer.appendChild(btnAll); // Append this button separately since we don't want it to collapse
        addListeners(btnAll);
        btnContainer.appendChild(collapseOtherBtns);
        addListeners(collapseOtherBtns);
        btnContainer.appendChild(otherBtnContainer);
        // document.querySelector("#body > div > div.uir-page-title-firstline > h1").insertAdjacentElement('afterend', btnContainer);
        document.querySelector("#body > div.uir-page-title.uir-page-title-list.uir-list-title.noprint").insertAdjacentElement('afterend', btnContainer);
        const list = document.querySelector("#flaglist");
        const sortable = Sortable.create(list, {
            sort: true,
            animation: 150,
        });
    }

    const startListening = () => {
        // Select the node that will be observed for mutations
        const targetNode = document.querySelector("#div__body");

        // Options for the observer (which mutations to observe)
        const config = { attributes: true, childList: true, subtree: true };

        // Callback function to execute when mutations are observed
        const callback = (mutationList, observer) => {
            for (const mutation of mutationList) {
                if (mutation.type === "attributes" && mutation.attributeName === "data-tooltip-enabled") {
                    // call readOrders(), determine how many of each type are in OP name? Update color and add count to buttons?
                    // allBtns should be an array which still contains the button objects
                    debug(`The ${mutation.attributeName} attribute was modified.`);
                    debug(mutation);
                    debug(allBtns);
                    setTimeout(() => {
                        countOrders();
                        allBtns.forEach((button) => {
                            button.innerHTML = `<p>${button.textIn} (${flagTotals[button.flagType].count})</p>`;
                        })
                        btnAll.innerHTML = `<p>Open All Assigned (${flagTotals["All"].count})</p>`; // This is not within allBtns for the sake of separation
                        allLis.forEach((listem) => {
                            if (flagTotals[listem.flagType].count > 0) {
                                listem.style.display = "list-item";
                            } else { listem.style.display = "none" };
                        })
                    }, 500)
                }
            }
        };

        // Create an observer instance linked to the callback function
        const observer = new MutationObserver(callback);

        // Start observing the target node for configured mutations
        observer.observe(targetNode, config);
    }

    const tableCheck = VM.observe(document.body, () => {
        // Find the target node
        const node = document.querySelector("#row0 > td:nth-child(1)");

        if (node) {
            makeButtons();
            startListening();
            // Uncomment below to set permanent height for order table
            // document.querySelector("#div__body").style.height = 560px;
            // document.querySelector("#body_actions")
            // Uncomment below to set options for controls above order tables
            const marginDiv = document.createElement("div");
            marginDiv.style.marginTop = "250px";
            marginDiv.id = "spacerdiv"
            document.querySelector("#footer_actions_form").before(marginDiv);

            // disconnect observer
            return true;
        }
    });
    // Return to stop script once we are done with transaction search scripts
    return;
}
////////////////////////////////////END TRANSACTION/SEARCH SCRIPTS/////////////////////////////////////
////////////////////////////////BEGIN SALES ORDER AND ESTIMATE SCRIPTS////////////////////////////////
/////////////////////////////////////BEGIN EXPEDITED GP BUTTONS//////////////////////////////////////
// Simple recursive helper to convert XML nodes to a JSON object
function xmlToObj(node) {
    let obj = {};

    for (let child of node.children) {
        if (child.children.length > 0) {
            if (child?.attributes?.name) {
                obj[child.attributes.name.value] = xmlToObj(child);
                continue; // Skip the default nodeName assignment for named nodes
            }
            if (obj[child.nodeName]) {
                // If we've already seen this nodeName, we need to convert it to an array (if it isn't one already) and push the new value
                if (!Array.isArray(obj[child.nodeName])) {
                    obj[child.nodeName] = [obj[child.nodeName]];
                }
                obj[child.nodeName].push(xmlToObj(child));
            } else {
                obj[child.nodeName] = xmlToObj(child);
            }
        } else {
            // We're assuming there are no terminating nodes with repeated names
            if (child?.attributes?.name) {
                obj[child.attributes.name.value] = child.textContent;
                continue; // Skip the default nodeName assignment for named nodes
            }
            obj[child.nodeName] = child.textContent;
        }
    }
    return obj;
}

async function grabXMLasJSON(url) {
    try {
        const response = await fetch(`${url}&xml=T`);
        const data = await response.text();
        const parser = new DOMParser();

        const parsedDoc = parser.parseFromString(data, "text/xml");
        return xmlToObj(parsedDoc.documentElement);
    } catch (error) {
        console.error("Error fetching or parsing XML:", error);
    }
}

async function displayExpGPInfo(lgp = false) {
    // Gather GP info for expedited shipments
    const getStandardOvernight = new RegExp('Service: FedEx Standard Overnight®, Quoted Rate: (\\d+\\.\\d{1,2})', 'i');
    const getPriorityOvernight = new RegExp('Service: FedEx Priority Overnight®, Quoted Rate: (\\d+\\.\\d{1,2})', 'i');
    const getTwoDay = new RegExp('Service: FedEx 2Day®, Quoted Rate: (\\d+\\.\\d{1,2})', 'i');
    const getTwoDayAM = new RegExp('Service: FedEx 2Day® AM, Quoted Rate: (\\d+\\.\\d{1,2})', 'i');
    const cleanTags = new RegExp('</*(?:u|b)>', 'g');
    const gpurl = document.querySelector("#custbody_gp_quickview_fs_lbl_uir_label").nextElementSibling.childNodes[1].attributes.onclick.nodeValue.match(/htt.*\d+ /g)[0].trim();
    const shipurl = document.querySelector("#custbody_shipquote_val > a").href;
    const expGPInfo = await grabXMLasJSON(gpurl);
    const orderAmount = Number(expGPInfo.record.custrecord_gp_so_amount);
    const poCosts = Number(expGPInfo.record.custrecord_gp_est_po);
    const stockCosts = Number(expGPInfo.record.custrecord_gp_est_item);
    const shipCosts = Number(expGPInfo.record.custrecord_gp_est_ship);
    const finalAmount = Number(expGPInfo.record?.custrecord_gp_invoice);
    const finalPO = Number(expGPInfo.record?.custrecord_gp_po);
    const finalStock = Number(expGPInfo.record?.custrecord_gp_item);
    const finalShip = Number(expGPInfo.record?.custrecord_gp_ship);
    const finalGP = expGPInfo.record?.custrecord_gp_per;

    const shipInfo = await grabXMLasJSON(shipurl);
    let parcelInfo = shipInfo.record?.custrecord_sq_quoted_parcel_rates?.replaceAll(cleanTags, '');
    // Ship quote info
    if (!parcelInfo) parcelInfo = "Not Found";
    const standardOvernight = parcelInfo.match(getStandardOvernight)?.[1] || "Not Found";
    const priorityOvernight = parcelInfo.match(getPriorityOvernight)?.[1] || "Not Found";
    const twoDay = parcelInfo.match(getTwoDay)?.[1] || "Not Found";
    const twoDayAM = parcelInfo.match(getTwoDayAM)?.[1] || "Not Found";
    let cstCost = document.querySelector("#shippingcost_fs_lbl_uir_label")?.nextElementSibling.textContent.trim();
    if (!cstCost) cstCost = 0;

    const marginNow = (orderAmount - poCosts - stockCosts - cstCost) / orderAmount;
    const marginWithTwoDay = twoDay === "Not Found" ? undefined : (orderAmount - poCosts - stockCosts - twoDay) / orderAmount;
    const marginWithOvernight = standardOvernight === "Not Found" ? undefined : (orderAmount - poCosts - stockCosts - standardOvernight) / orderAmount;
    const marginWithPriorityOvernight = priorityOvernight === "Not Found" ? undefined : (orderAmount - poCosts - stockCosts - priorityOvernight) / orderAmount;
    const marginWithTwoDayAM = twoDayAM === "Not Found" ? undefined : (orderAmount - poCosts - stockCosts - twoDayAM) / orderAmount;

    // console.log(expGPInfo);
    // console.log(`Order Amount: ${orderAmount}, PO Costs: ${poCosts}, Stock Costs: ${stockCosts}, Ship Costs: ${shipCosts}`);
    // console.log(shipInfo);
    // console.log(parcelInfo);
    // console.log(`Standard Overnight: ${standardOvernight}, Priority Overnight: ${priorityOvernight}, 2Day: ${twoDay}, 2Day AM: ${twoDayAM}`);

    // Now we have all the info, let's insert it into the page in a new row under the GP quick view link
    const gpTr = document.querySelector("#custbody_gp_quickview_fs_lbl_uir_label").parentElement.parentElement.parentElement;
    const quoteTr = document.createElement("tr");
    quoteTr.class = "uir-field-wrapper-cell";
    quoteTr.id = "cust_shipgp_info";
    quoteTr.quote = {};
    quoteTr.quote.twoDay = twoDay;
    quoteTr.quote.twoDayAM = twoDayAM;
    quoteTr.quote.priorityOvernight = priorityOvernight;
    quoteTr.quote.standardOvernight = standardOvernight;
    quoteTr.gp = {};
    quoteTr.gp.orderAmount = orderAmount;
    quoteTr.gp.poCosts = poCosts;
    quoteTr.gp.stockCosts = stockCosts;
    quoteTr.gp.shipCosts = shipCosts;
    const twoDayButton = document.createElement("button");
    twoDayButton.textContent = "Copy 2Day";
    twoDayButton.onclick = () => {
        preventDefault();
        stopPropagation();
        const date = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
        const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" });
        const so = document.querySelector("[class='uir-record-id']").textContent.trim();
        const twoDayInfo = `${date}	${time}	${so}	Two-Day	${cstCost}	${twoDay}	${(marginNow * 100).toFixed(2)}%	${(marginWithTwoDay * 100).toFixed(2)}%	No Action	${marginWithTwoDayAM ? `Quoted 2Day. 2DayAM $${twoDayAM} / ${(marginWithTwoDayAM * 100).toFixed(2)}%` : ""}`;
        navigator.clipboard.writeText(twoDayInfo).then(() => {
            // alert(`Copied 2Day rate of $${twoDay} to clipboard!`);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };
    const oneDayButton = document.createElement("button");
    oneDayButton.textContent = "Copy OneDay";
    oneDayButton.onclick = () => {
        preventDefault();
        stopPropagation();
        const date = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
        const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "numeric" });
        const so = document.querySelector("[class='uir-record-id']").textContent.trim();
        const oneDayInfo = `${date}	${time}	${so}	One-Day	${cstCost}	${standardOvernight}	${(marginNow * 100).toFixed(2)}%	${(marginWithOvernight * 100).toFixed(2)}%	No Action	${marginWithPriorityOvernight ? `Quoted Standard Overnight. Priority Overnight $${priorityOvernight} / ${(marginWithPriorityOvernight * 100).toFixed(2)}%` : ""}`;
        navigator.clipboard.writeText(oneDayInfo).then(() => {
            // alert(`Copied OneDay rate of $${standardOvernight} to clipboard!`);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };
    quoteTr.innerHTML = `<td> <div class="uir-field-wrapper uir-long-text" data-nsps-label="Expedited Shipping Quotes" data-nsps-type="field" > <span id="cust_exp_span_span" class="smallgraytextnolink uir-label" data-nsps-type="field_label" ><span id="cust_exp_span" class="uir-label-span smallgraytextnolink" style="" data-nsps-type="label" ><a tabindex="-1" title="What's this?" href='javascript:void("help")' style="cursor: help" class="smallgraytextnolink uir-no-link" onmouseover="setFirstClassName(this, 'smallgraytext'); return true;" onmouseout="setFirstClassName(this, 'smallgraytextnolink'); " >Expedited Shipping Quotes</a > </span></span ><span class="uir-field inputreadonly uir-resizable" data-nsps-type="field_input" data-field-type="textarea"><b>Standard Overnight:</b> $${standardOvernight}<br><b>Priority Overnight:</b> $${priorityOvernight}<br><b>2Day:</b> $${twoDay}<br><b>2Day AM:</b> $${twoDayAM} </span> </div> </td>`;

    // Integrating ship cost info
    if (lgp) {
        const shipCostTable = captureTableData(document.querySelector("#recmachcustrecord_pacejet_transaction_link__tab"), true);
        const net = shipCostTable[0].indexOf("Net charge"); // Find the column with the actual charge
        console.log(`Column is at index ${net}`);
        shipCostTable.shift(); // Remove the header row so we can loop through just the data
        let shipCost = 0;
        if (net != -1) {
            for (let i = 0, end = shipCostTable.length; i < end; i++) {
                console.log(`Adding cost: ${shipCostTable[i][net]}`);
                shipCost += Number(shipCostTable[i][net]);
            }
        }

        let realMargin = undefined;
        if (finalAmount) {
            realMargin = (finalAmount - finalPO - finalStock - shipCost) / finalAmount;
        }
        const shipTr = document.createElement("tr");
        shipTr.className = "uir-field-wrapper-cell";
        shipTr.id = "cust_shipcost_info";
        shipTr.innerHTML = `<td> <div class="uir-field-wrapper uir-long-text" data-nsps-label="True Shipping Cost" data-nsps-type="field" > <span id="cust_exp_span_span" class="smallgraytextnolink uir-label" data-nsps-type="field_label" ><span id="cust_exp_span" class="uir-label-span smallgraytextnolink" style="" data-nsps-type="label" ><a tabindex="-1" title="What's this?" href='javascript:void("help")' style="cursor: help" class="smallgraytextnolink uir-no-link" onmouseover="setFirstClassName(this, 'smallgraytext'); return true;" onmouseout="setFirstClassName(this, 'smallgraytextnolink'); " >True Shipping Cost</a > </span></span ><span class="uir-field inputreadonly uir-resizable" data-nsps-type="field_input" data-field-type="textarea"><b>Recorded Shipping Cost/GP: $${finalShip}, GP: ${finalGP}</b><br><b>True Shipping Cost:</b> $${shipCost.toFixed(2)}<br>GP calculated expected ship cost. Invoiced cost is $${shipCost.toFixed(2)}, GP ${realMargin ? (realMargin * 100).toFixed(2) : "0.00"}%</span> </div> </td>`;
        const copyRealMarginButton = document.createElement("button");
        copyRealMarginButton.textContent = "Copy Real Margin";
        copyRealMarginButton.onclick = () => {
            preventDefault();
            stopPropagation();
            navigator.clipboard.writeText(`GP calculated expected ship cost. Invoiced cost is $${shipCost.toFixed(2)}, GP ${realMargin ? (realMargin * 100).toFixed(2) : "0.00"}%`);
        };

        gpTr.insertAdjacentElement("afterend", copyRealMarginButton);
        gpTr.insertAdjacentElement("afterend", shipTr);
    }
    // End integration of ship cost info

    gpTr.insertAdjacentElement("afterend", oneDayButton);
    gpTr.insertAdjacentElement("afterend", twoDayButton);
    gpTr.insertAdjacentElement("afterend", quoteTr);
    return expGPInfo;
}
////////////////////////////////////////END EXPEDITED GP BUTTONS//////////////////////////////////////
///////////////////////////////////////BEGIN HIDE UNUSED BUTTONS/////////////////////////////////////
function hideButtons() {
    const buttonsToHide = ["#tbl_createdeposit", "#tbl_narrativeButton", "#tbl_custpage_create_checklist"];
    buttonsToHide.forEach((btn) => {
        if (document.querySelector(btn)?.parentElement) {
            document.querySelector(btn).parentElement.style.display = "none";
        }
    });
    // const newAfter = document.querySelector("#e7d-element2 > table > tbody > tr > td:nth-child(3)");

    // const unHideButtonTd = document.createElement("td");
    // unHideButtonTd.innerHTML = `<table id="tbl_unhide" cellpadding="0" cellspacing="0" border="0" class="uir-button" style="margin-right:6px;" role="presentation"> <tbody><tr id="tr_unhide" class="pgBntG"> <td id="tdleftcap_new"><img src="/images/nav/ns_x.gif" class="bntLT" border="0" height="50%" width="3" alt=""> <img src="/images/nav/ns_x.gif" class="bntLB" border="0" height="50%" width="3" alt=""> </td> <td id="tdbody_unhide" height="20" valign="top" nowrap="" class="bntBgB"> </td> <td id="tdrightcap_unhide"> <img src="/images/nav/ns_x.gif" height="50%" class="bntRT" border="0" width="3" alt=""> <img src="/images/nav/ns_x.gif" height="50%" class="bntRB" border="0" width="3" alt=""> </td> </tr> </tbody></table>`;
    // const unHideButton = document.createElement("button");
    // unHideButton.textContent = "Unhide Buttons";
    // unHideButton.classList.add("bntBgT");
    // unHideButton.value = "Unhide Buttons";
    // unHideButton.id = "unhide";
    // unHideButton.name = "unhide";
    // unHideButton.onclick = () => {
    //     preventDefault();
    //     stopPropagation();
    //     buttonsToHide.forEach((btn) => {
    //         if (document.querySelector(btn)?.parentElement) {
    //             document.querySelector(btn).parentElement.style.display = 'unset';
    //         }
    //     });
    // };
    // newAfter.insertAdjacentElement("afterend", unHideButtonTd);
    // document.querySelector("#tdbody_unhide").appendChild(unHideButton);
}
/////////////////////////////////////////END HIDE USED BUTTONS////////////////////////////////////////
////////////////////////////////////////BEGIN VIEWED TAB MARKER/////////////////////////////////////////
function markUnviewedTab() {
    document.title = `• ${document.title}`
}

function markViewedTab() {
    // If the user is currently looking at the tab, load the URL
    if (document.visibilityState === "visible") {
        // Using .replace() means this holding page won't clog up the user's "Back" button history
        // Wait a short time before performing the redirect so the initial opening phase doesn't trigger it
        setTimeout(() => {
            if (document.visibilityState === "visible") {
                if (document.title.startsWith("• ")) {
                    document.title = document.title.replace("• ", "");
                }
            }
        }, 500);
    }
}
//////////////////////////////////BEGIN FIX FOR WHITE SPACE SETTING//////////////////////////////////
const whiteSpaceList = [];
function fixWhiteSpaceNodes(node) {
    for (let child of node.children) {
        if (child.style?.whiteSpace == "pre") {
            whiteSpaceList.push(child);
        }
        if (child.children.length > 0) {
            fixWhiteSpaceNodes(child);
        }
    }
    whiteSpaceList.forEach(node => {
        node.style.whiteSpace = "normal";
    });
    return whiteSpaceList;
}
///////////////////////////////////END FIX FOR WHITE SPACE SETTING////////////////////////////////////
///////////////////////////////BEGIN DELIVERY INSTRUCTIONS COPY BUTTON///////////////////////////////

// Function to resize potentially giant changelogs
function changeLogResize() {
    if (document.querySelector('[data-nsps-label="Line Item Change Log"]')) {
        const changeLog = document.querySelector('[data-nsps-label="Line Item Change Log"]');
        if (changeLog.offsetHeight > 225) {
            changeLog.style.overflow = "auto";
            changeLog.style.resize = "vertical";
            changeLog.style.border = "1px solid black";
            changeLog.style.height = "225px";
        }
        // changeLog.style.height = "85px";
    }
}

// Function for delivery instructions button to invoke
// Copy text from cst comments to delivery instructions, and add space if text is already present
const copyToDelIns = () => {
    const cstComments = document.querySelector("#custbody_customer_order_comments").value;
    const delIns = document.querySelector("#custbody_pacejet_delivery_instructions");
    if (delIns.value.includes(cstComments)) {
        return;
    }
    if (delIns.value !== '') delIns.value += '\n\n';
    delIns.value += cstComments;
};

const copyToProdMem = () => {
    const cstComments = document.querySelector("#custbody_customer_order_comments").value;
    const prodMem = document.querySelector("#custbody20");
    if (prodMem.value.includes(cstComments)) {
        return;
    }
    if (prodMem.value !== '') prodMem.value += '\n\n';
    prodMem.value += cstComments;
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
    confPop.style.top = `${y - 36}px`;
    confPop.style.left = `${x - 31}px`;
    confPop.style.backgroundColor = '#fff';
    confPop.style.border = '1px solid #000';
    confPop.style.padding = '10px';
    confPop.style.zIndex = 1000;
    confPop.style.opacity = 1;
    document.body.appendChild(confPop);
    // debug(confPop.offsetWidth);
    // debug(confPop.offsetHeight);

    // Fade the popup out
    fadeOutEffect(confPop);

    // And remove it
    setTimeout(() => {
        confPop.remove();

    }, 1500);
};

const formatCopyButton = (btn) => {
    if (!btn) {
        console.log("Button not found");
        return;
    }
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
}

const createCopyTable = () => {
    const copyTable = document.createElement("div");
    copyTable.style.display = "inline-block";
    // NetSuite 2.1 broke the original placement so this will have to do for now
    // copyTable.style.position = "absolute";
    // copyTable.style.left = "-13em";
    copyTable.style.position = "relative";
    copyTable.style.right = "-22em";
    copyTable.style.marginTop = "-10em";
    copyTable.innerHTML = `<table style="text-align: center; width: 2em; display: inline-block;"><thead><tr><th colspan="2" style="border: 1px solid black; background-color: #bdbdbd; text-align: center;">Copy To:</th></tr></thead><tbody><tr><td class="button" id="delbtn" style="border: 1px solid #508595; padding: 6px 3px; background-color: #e4eaf5; text-wrap: auto;cursor: pointer;user-select: none;">Delivery Instructions</td><td class="button" id="prodbtn" style="border: 1px solid #508595; padding: 6px 3px; background-color: #e4eaf5; text-wrap: auto;height: 86px;cursor: pointer;user-select: none;">Production Memo</td></tr><tr><td class="status" id="delrdy" style="border: 1px solid #508595; background-color: #f8f892;">Ready</td><td class="status" id="prodrdy" style="border: 1px solid #508595; background-color: #f8f892;">Ready</td></tr></tbody></table>`;
    // document.querySelector("#custbody_customer_order_comments").after(copyTable);
    document.querySelector("#custbody_customer_order_comments_fs > div > div.uir-resizable-element-resizer").after(copyTable);
    const awaitTable = VM.observe(document.body, () => {
        // Find the target node
        const node = document.querySelector("#delbtn");

        if (node) {
            const delBtn = document.querySelector("#delbtn");
            const prodBtn = document.querySelector("#prodbtn");
            const delRdy = document.querySelector("#delrdy");
            const prodRdy = document.querySelector("#prodrdy");
            formatCopyButton(delBtn);
            delBtn.onclick = () => {
                copyToDelIns();
                delRdy.innerHTML = "Done!";
                delRdy.style.backgroundColor = "#8fce00";
            }
            formatCopyButton(prodBtn);
            prodBtn.onclick = () => {
                copyToProdMem();
                prodRdy.innerHTML = "Done!";
                prodRdy.style.backgroundColor = "#8fce00";
            }

            // disconnect observer
            return true;
        }
    });
}

//Wait until document is sufficiently loaded, then inject button
if (isEd) {
    const disconnect = VM.observe(document.body, () => {
        // Find the target node
        const node = document.querySelector("#custbody_customer_order_comments");

        if (node) {
            // createDelInsBtn();
            createCopyTable();
            // checkIP();

            // disconnect observer
            return true;
        }
    });
};

///////////////////////////////END DELIVERY INSTRUCTIONS COPY BUTTON///////////////////////////////
///////////////////////////////////BEGIN AUTO PROCESSING FUNCTION/////////////////////////////////
function autoProcess() {
    if (isEd && isPcs) {
        console.log("Checking processed")
        document.querySelector("#custbody_order_processed_fs_inp").click();
        console.log("Submitting");
        document.querySelector("#btn_multibutton_submitter").click();
    }
}
////////////////////////////////////END AUTO PROCESSING FUNCTION//////////////////////////////////
////////////////////////////////BEGIN RISK SCORE IN TITLE FUNCTION///////////////////////////////
function riskTitle() {
    if (document.querySelector("#tr_fg_fieldGroup325 > td:nth-child(1) > table > tbody > tr:nth-child(4) > td > div > span.uir-field.inputreadonly.uir-user-styled.uir-resizable > figure > table > tbody > tr:nth-child(2) > td:nth-child(2)")) {
        const fraudDecision = document.querySelector("#tr_fg_fieldGroup325 > td:nth-child(1) > table > tbody > tr:nth-child(4) > td > div > span.uir-field.inputreadonly.uir-user-styled.uir-resizable > figure > table > tbody > tr:nth-child(2) > td:nth-child(1)").textContent;
        if (fraudDecision == "REVIEW") {
            const riskScore = document.querySelector("#tr_fg_fieldGroup325 > td:nth-child(1) > table > tbody > tr:nth-child(4) > td > div > span.uir-field.inputreadonly.uir-user-styled.uir-resizable > figure > table > tbody > tr:nth-child(2) > td:nth-child(2)").textContent;
            document.title += ` [${riskScore}]`;
        }
    }
}
/////////////////////////////////END RISK SCORE IN TITLE FUNCTION//////////////////////////////////
//////////////////////////////////BEGIN DOUBLE CLICK XML STOPPER//////////////////////////////////
const stopDoubleClickXml = () => {
    console.log("Stopping double-click XML");
    const element = document.querySelector("#main_form > div > div.uir-page-title.uir-page-title-record");
    element.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        event.preventDefault();
    }, true);
}
//////////////////////////////////END DOUBLE CLICK XML STOPPER/////////////////////////////////////
///////////////////////BEGIN EXTRA SCROLL BAR ELIMINATOR///////////////////////
// document.querySelector("div[style*='scroll hidden']").style.overflow = 'hidden'
const sbarConfig = { attributes: true, childList: false, subtree: true, attributeFilter: ['style'], attributeOldValue: true };
const lookForScrollBars = (mutationList, observer) => {
    mutationList.forEach((mutation) => {
        // console.log(mutation);
        // document.querySelector("#item_layer > div > div > div.uir-machine-floating-scrollbar")
        // if (mutation.oldValue?.includes('scroll hidden')) {
        //     const target = mutation.target;
        //     target.style.overflow = 'hidden';
        //     console.log("Removed extra scroll bar");
        // }
        if (mutation.target.className == "uir-machine-floating-scrollbar" && mutation.target.style.overflow != 'hidden') {
            mutation.target.style.overflow = 'hidden';
            console.log("Removed extra scroll bar");
        }
    });
}
///////////////////////END EXTRA SCROLL BAR ELIMINATOR///////////////////////

// Creates a copy of the "New Note" button underneath the flags
const copyNoteButton = () => {
    try {
        console.log("Copying button...")
        // const oldNote = document.querySelector("#newhist");
        const oldNote = document.querySelector("[data-nsps-label='New Note']");
        const newNote = oldNote.cloneNode(true);
        newNote.style.height = "stretch";
        noteButton = document.createElement("div");
        noteButton.style.backgroundColor = "#ededdb";
        noteButton.style.border = "1px solid black";
        noteButton.style.borderRadius = "5px";
        noteButton.style.width = "65px";
        noteButton.style.height = "30px";
        noteButton.style.display = "flex";
        noteButton.style.flexWrap = "wrap";
        noteButton.style.alignContent = "center";
        noteButton.appendChild(newNote);
        document.querySelector("#custbody_order_processing_flags_val").parentNode.parentNode.after(noteButton);
    } catch (error) {
        console.log(error);
    }
}

// General listener for page load, both to inject after plugins and for non-SO pages
window.addEventListener('load', (event) => {
    console.log('The page, scripts, and all images are fully loaded, supposedly. Changing title.');
    riskTitle();
    markUnviewedTab();
    // Listen for the user switching to this tab
    document.addEventListener("visibilitychange", markViewedTab);
    console.log("Fixing white space nodes");
    fixWhiteSpaceNodes(document.body);
});


const loadCheck = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custom189_div");

    if (node) {
        changeLogResize();
        hideButtons();
        if (!isEd) {
            displayExpGPInfo(true);
        }
        // grabCases();
        if (!isEST) {
            copyNoteButton();
        }
        // getFraudInfoBtn();
        // parseAddress();
        stopDoubleClickXml();
        // autoProcess();
        const sbarObserver = new MutationObserver(lookForScrollBars);
        sbarObserver.observe(document.body, sbarConfig);
        // displayInvoicedShipCost();
        // const links = createSearchLinks();
        // We are lazy and let the browser figure out that a space in a link is the same as %20
        // const html = `<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8" /> <meta name="viewport" content="width=device-width, initial-scale=1.0" /> <title>Fraud Checking</title> </head> <body> <style> #fraudlinks { display: flex; /* flex-wrap: wrap; */ /* align-content: center; */ justify-content: center; margin-top: 20px; } #addressinfo { display: flex; flex-wrap: wrap; align-content: center; justify-content: center; } #billtodetails { display: inline-block; border: 1px solid black; } #shiptodetails { display: inline-block; border: 1px solid black; margin-left: 12px; } .container { width: auto; min-width: 246px; margin: 0px 6px; padding: 3px 6px; border: 1px solid black; } .result.container { width: 33%; min-width: 165px; } .search { display: flex; flex-wrap: wrap; justify-content: space-between; width: auto; margin: 0px 6px; padding: 3px 6px; } .term { margin-right: 30px; } .links { display: inline-block; flex-wrap: wrap; align-content: center; } .bold { font-weight: 600; } .inline { display: inline; } h3 { margin-top: 0px; align-self: center; justify-content: center; text-align: center; } img { height: 32px; width: 32px; } a { text-decoration: none; } </style> <div id="addressinfo"> <div id="billtodetails" class="container"> <h3>Bill-to Address Details:</h3> <p class="bold inline">Customer Contact:</p> <p class="inline">${cst.bill.name}</p> <br /> <p class="bold inline">Company:</p> <p class="inline">${cst.bill.company}</p> <br /> <p class="bold inline">Street Address:</p> <p class="inline">${cst.bill.street}</p> <br /> <p class="bold inline">Suite:</p> <p class="inline">${cst.bill.suite}</p> <br /> <p class="bold inline">City:</p> <p class="inline">${cst.bill.city}</p> <br /> <p class="bold inline">State:</p> <p class="inline">${cst.bill.state}</p> <br /> <p class="bold inline">Zip:</p> <p class="inline">${cst.bill.zip}</p> <br /> <p class="bold inline">Country:</p> <p class="inline">${cst.bill.country}</p> <br /> </div> <div id="shiptodetails" class="container"> <h3>Ship-to Address Details:</h3> <p class="bold inline">Customer Contact:</p> <p class="inline">${cst.ship.name}</p> <br /> <p class="bold inline">Company:</p> <p class="inline">${cst.ship.company}</p> <br /> <p class="bold inline">Street Address:</p> <p class="inline">${cst.ship.street}</p> <br /> <p class="bold inline">Suite:</p> <p class="inline">${cst.ship.suite}</p> <br /> <p class="bold inline">City:</p> <p class="inline">${cst.ship.city}</p> <br /> <p class="bold inline">State:</p> <p class="inline">${cst.ship.state}</p> <br /> <p class="bold inline">Zip:</p> <p class="inline">${cst.ship.zip}</p> <br /> <p class="bold inline">Country:</p> <p class="inline">${cst.ship.country}</p> <br /> </div> </div> <div id="fraudlinks"> <div class="result container"> <h3>Bill-to Address Searches</h3> ${links.bill.html} </div> <div class="result container"> <h3>Hybrid Searches</h3> ${links.hybrid.html} </div> <div class="result container"> <h3>Ship-to Address Searches</h3> ${links.ship.html} <!-- <div class="search"> <div class="term inline"> <p class="bold">Street/Suite + City/State/Zip:</p> <p> ${cst.ship.street} ${cst.ship.suite == 'N/A' ? '' : cst.ship.suite} ${cst.ship.city} ${cst.ship.state} ${cst.ship.zip} </p> </div> <div class="links"> <a href="https://www.truepeoplesearch.com/resultaddress?streetaddress=${cst.ship.street} ${cst.ship.suite == 'N/A' ? '' : cst.ship.suite}&citystatezip=${cst.ship.city} ${cst.ship.state} ${cst.ship.zip}" target="_blank" > <img src="https://play-lh.googleusercontent.com/aNUH0g2ASIp8tN9OnJpccMxQJDkZLPxrKWhw2OnGkDNA2WLePAOU9iWSXkSt5P3OY_0=w240-h480-rw" alt="TruePeopleSearch" title="TruePeopleSearch" /> </a> </div> </div> --> </div> </div> </body> </html>`;
        // const fraudFrame = createFraudFrame();
        // bTreeTab.before(fraudFrame);
        // fraudFrame.contentWindow.document.open();
        // fraudFrame.contentWindow.document.write(html);
        // fraudFrame.contentWindow.document.close();

        // disconnect observer
        return true;
    }
});

const pcsLoadCheck = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector(`#item_row_1 > td:nth-child(1)`);

    if (node) {
        console.log("Toolbox loaded");
        autoProcess();

        // disconnect observer
        return true;
    }
});
