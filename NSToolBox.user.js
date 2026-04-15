// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/transactionlist.nl*
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCopyComment/main/NSToolBox.user.js
// @grant       GM.setValue
// @grant       GM.getValue
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @require     https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js
// @version     1.51
// ==/UserScript==

/*jshint esversion: 6 */

// Declare const to determine if document is in edit mode
const edCheck = new RegExp('e=T');
const url = window.location.href;
const isEd = edCheck.test(url);

// Determine if record is estimate
const estCheck = new RegExp(/estimate\.nl/);
const isEST = estCheck.test(url);

const perfDebug = false;

function debug(stuff) {
    if (perfDebug) {
        console.log(stuff);
    }
}

///////////////////////////////////BEGIN TRANSACTION/SEARCH SCRIPTS////////////////////////////////////

// TODO: Add more flag types, make it easier to add flags
// TODO: Make the sort list collapsible and consider if it should be collapsed by default
// Test if the URL is a transaction search and proceed with relevant scripts
if (url.includes("transactionlist")) {

    // New simpler function to capture table data as 2D array
    // Does not care if the table is in edit mode or not, but may return empty rows if in edit mode
    // Modified from other scripts to push the actual elements
    function captureTableData(tableElement) {
        const rows = tableElement.querySelectorAll("tr");
        const data = [];
        rows.forEach(row => {
            const cols = row.querySelectorAll("td,th");
            const rowData = [];
            cols.forEach(col => {
                rowData.push(col);
            });
            data.push(rowData);
        });
        return data;
    }

    let colIndex = { // Similar to itmCol, eventually stores column names.
        doc: "DOCUMENT #",
        op: "OP IN CHARGE",
        status: "STATUS",
        memo: "MEMO",
        flags: "MAJOR FLAGS",
        set: false
    };


    // Important note: the browser may block pop-ups if opening multiple tabs. The user can either click the "Pop Ups Blocked" notification in the URL bar and allow them, or on Chrome navigate to Settings > Privacy and security > Site settings > Pop-ups and redirects (chrome://settings/content/popups) and then add NetSuite
    function open_tabs(urls) {
        urls.forEach((url) => {
            debug(`Opening ${url}`);
            window.open(url);
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
        "Comment": { count: 0, text: "Comment", liid: "licmt", defOrder: 1, btnText: "Open Comments" },
        "Tax Exempt": { count: 0, text: "Tax Exempt", liid: "litax", defOrder: 2, btnText: "Open Tax Exempts" },
        "$0 Order": { count: 0, text: "$0 Order", liid: "lizer", defOrder: 3, btnText: "Open $0 Orders" },
        "Address Validation": { count: 0, text: "Address Validation", liid: "liadd", defOrder: 4, btnText: "Open Address Validation" },
        "Short Address": { count: 0, text: "Address Line 1", liid: "lishort", defOrder: 5, btnText: "Open Short Address" },
        "Low Gross Profit": { count: 0, text: "Low Gross Profit", liid: "lilgr", defOrder: 6, btnText: "Open Low Gross Profit" },
        "Sales Rep": { count: 0, text: "Sales Rep:", liid: "lisr", defOrder: 7, btnText: "Open Sales Rep" },
        "LOA Needed": { count: 0, text: "(LOA) Needed", liid: "liloa", defOrder: 8, btnText: "Open LOA Needed" },
        "Outside US48": { count: 0, text: "Outside the US48", liid: "lius48", defOrder: 9, btnText: "Open !US48s" },
        "None": { count: 0, text: " \n", liid: "linon", defOrder: 10, btnText: "Open No Flags" },
        "Other": { count: 0, text: "Other", liid: "lioth", defOrder: 11, btnText: "Open Other Flags" },
        "Fraud Review": { count: 0, text: "Fraud Review:", liid: "lifraud", defOrder: 12, btnText: "Open Fraud Orders" },
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
        document.querySelector("#flaglist").childNodes.forEach((node) => {
            flagOrder.push(node.flagType);
        });
        debug(tableState);
        const orderURLs = [];
        switch (scope) {
            case "All":
                // Foreach flag types, loop through orders
                flagOrder.forEach((type) => {
                    for (let j = 0; j <= tableState.length - 1; j++) {
                        if (tableState[j].op == userName && tableState[j].flags.types[0] == type) {
                            orderURLs.push(tableState[j].url);
                        }
                    };
                })
                break;
            default:
                for (let i = 0; i <= tableState.length - 1; i++) {
                    if (tableState[i].op == userName && tableState[i].flags.types.includes(scope)) {
                        orderURLs.push(tableState[i].url);
                    }
                }
                break;
        }
        debug(orderURLs);
        debug(userName);
        open_tabs(orderURLs);
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
        otherBtnContainer.style.backgroundColor = "#f0f8ff";
        otherBtnContainer.style.display = "inline-flex";
        otherBtnContainer.style.flexWrap = "wrap";
        otherBtnContainer.style.maxWidth = "90vw";
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
////////////////////////////////////BEGIN FRAUD INFO COPY BUTTON//////////////////////////////////
const getFraudInfo = () => {
    if (!document.querySelector("[data-field-name='custbody_kountlink']").innerText.includes("Link")) {
        return;
    }
    const salesOrd = document.querySelector("#tranid_fs_lbl_uir_label").nextElementSibling.innerText;
    const dateCreated = document.querySelector("#custbody_esc_created_date_fs_lbl_uir_label").nextElementSibling.innerText;
    const amount = document.querySelector("#custbody34_fs_lbl_uir_label").nextElementSibling.innerText;
    const riskScore = document.querySelector("[data-field-name='custbody_riskdata'] > span.uir-field.inputreadonly.uir-user-styled.uir-resizable > figure > table > tbody > tr:nth-child(2) > td:nth-child(2)").innerText;
    const triggers = document.querySelector("[data-field-name='custbody_riskdata'] > span.uir-field.inputreadonly.uir-user-styled.uir-resizable > figure > table > tbody > tr:nth-child(4) > td").innerText;
    const avs = document.querySelector("#custbody119_fs_lbl_uir_label").nextElementSibling.innerText;
    const cvv = document.querySelector("#custbody118_fs_lbl_uir_label").nextElementSibling.innerText;

    let fraudInfo = [salesOrd, dateCreated, amount, riskScore, triggers, avs, cvv];
    fraudInfo = fraudInfo.map((el) => `"${el}"`);

    navigator.clipboard.writeText(fraudInfo.join("	"));
}

const getFraudInfoBtn = () => {
    const btn = document.createElement("button");
    btn.innerHTML = "Copy Fraud Info";
    const fraudReview = document.querySelector("[data-field-name='custbody78']")
    fraudReview.insertAdjacentElement("beforebegin", btn);
    btn.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        getFraudInfo();
    });
}
////////////////////////////////////END FRAUD INFO COPY BUTTON/////////////////////////////////////
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
        debug(error);
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
                debug(`Street address (${currentSearch}) found on line ${index + 1}`);
                cst.ship.street = element;
                break;
            case suiteReg.test(element):
                debug(`Suite number (${currentSearch}) found on line ${index + 1}`);
                cst.ship.suite = element;
                break;
            case cszReg.test(element):
                debug(`City/State/Zip (${currentSearch}) found on line ${index + 1}`);
                const csz = breakCSZ.exec(element);
                if (csz) {
                    cst.ship.city = csz.groups.city;
                    cst.ship.state = csz.groups.state;
                    cst.ship.zip = csz.groups.zip;
                }
                break;
            case countryReg.test(element):
                debug(`Country (${currentSearch}) found on line ${index + 1}`);
                cst.ship.country = element.replace("Map", "").trim();
                break;
            default:
                if (index == 1) {
                    debug(`Company (${currentSearch}) found on line ${index + 1}`);
                    cst.ship.company = element;
                } else if (index == 0) {
                    debug(`Customer (${currentSearch}) found on line ${index + 1}`);
                    cst.ship.name = element;
                } else {
                    debug(`No matches found for ${element}`);
                }
                break;
        }
    });
    currentSearch = 'Bill-to';
    billArray.forEach((element, index) => {
        switch (true) {
            case streetReg.test(element):
                debug(`Street address (${currentSearch}) found on line ${index + 1}`);
                cst.bill.street = element;
                break;
            case suiteReg.test(element):
                debug(`Suite number (${currentSearch}) found on line ${index + 1}`);
                cst.bill.suite = element;
                break;
            case cszReg.test(element):
                debug(`City/State/Zip (${currentSearch}) found on line ${index + 1}`);
                const csz = breakCSZ.exec(element);
                if (csz) {
                    cst.bill.city = csz.groups.city;
                    cst.bill.state = csz.groups.state;
                    cst.bill.zip = csz.groups.zip;
                }
                break;
            case countryReg.test(element):
                debug(`Country (${currentSearch}) found on line ${index + 1}`);
                cst.bill.country = element.replace("Map", "").trim();
                break;
            default:
                if (index == 1) {
                    debug(`Company (${currentSearch}) found on line ${index + 1}`);
                    cst.bill.company = element;
                } else if (index == 0) {
                    debug(`Customer (${currentSearch}) found on line ${index + 1}`);
                    cst.bill.name = element;
                } else {
                    debug(`No matches found for ${element}`);
                }
                break;
        }
    });
    cst.bill.csz = `${cst.bill.city} ${cst.bill.state} ${cst.bill.zip}`;
    cst.ship.csz = `${cst.ship.city} ${cst.ship.state} ${cst.ship.zip}`;
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

/////////////////////////////////////END FRAUD CHECK TOOLS//////////////////////////////////////
////////////////////////////////////////BEGIN CASE TOOL////////////////////////////////////////

const countCases = () => {
    if (!document.querySelector(`#casesrow0`)) {
        return "NA";
    }
    let caseCount = 0;
    while (document.querySelector(`#casesrow${caseCount}`)) {
        caseCount++
    }
    return caseCount - 1;
}

const grabCases = () => {
    const caseCount = countCases();
    if (caseCount == "NA") {
        return caseCount;
    }
    let curCase = 0;
    let curInfo = [];
    const caseInfo = [];
    while (curCase <= caseCount) {
        curInfo.push(document.querySelector(`#casesrow${curCase}`).childNodes[7].textContent);
        curInfo.push(document.querySelector(`#casesrow${curCase}`).childNodes[5].textContent);
        curInfo.push(document.querySelector(`#casesrow${curCase}`).childNodes[9].textContent)
        curInfo.push(document.querySelector(`#casesrow${curCase}`).childNodes[5].firstChild.href);
        caseInfo.push(curInfo);
        curInfo = [];
        curCase++;
    }
    console.log(caseInfo);
}

const showCases = () => {
    return;
}

////////////////////////////////////////END CASE TOOL////////////////////////////////////////
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

const loadCheck = VM.observe(document.body, () => {
    // Find the target node
    const node = document.querySelector("#custom189_div");

    if (node) {
        changeLogResize();
        grabCases();
        if (!isEST) {
            copyNoteButton();
        }
        getFraudInfoBtn();
        parseAddress();
        stopDoubleClickXml();
        const sbarObserver = new MutationObserver(lookForScrollBars);
        sbarObserver.observe(document.body, sbarConfig);
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
