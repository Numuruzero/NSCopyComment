// ==UserScript==
// @name        NetSuite Toolbox
// @namespace   jhutt.com
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/salesord.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/estimate.nl*
// @match       https://1206578.app.netsuite.com/app/accounting/transactions/transactionlist.nl*
// @downloadURL https://raw.githubusercontent.com/Numuruzero/NSCopyComment/main/NSCopyComment.js
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @require     https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js
// @version     1.475
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

// Test if the URL is a transaction search and proceed with relevant scripts
if (url.includes("transactionlist")) {

    colIndex = {
        doc: 0,
        op: 0,
        status: 0,
        memo: 0,
        flags: 0,
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
        debug(`There are ${lastRow} rows`);
        // Rows are 0-indexed so subtract one
        return lastRow - 1;
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
        debug(`There are ${lastColumn} columns`);
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
        let headerText;
        while (row <= totalRows) {
            currentRow = [];
            while (column <= totalColumns) {
                aRow = document.querySelector(`#row${row} > td:nth-child(${column})`);
                currentRow.push(aRow);
                if (colIndex.set == false) {
                    headerText = document.querySelector(`#div__lab${column}`).textContent.toUpperCase();
                    debug(headerText);
                    switch (true) {
                        case headerText.includes("DOCUMENT"):
                            colIndex.doc = column - 1;
                            break;
                        case headerText.includes("OP IN CHARGE"):
                            colIndex.op = column - 1;
                            break;
                        case headerText.includes("STATUS"):
                            colIndex.status = column - 1;
                            break;
                        case headerText.includes("MEMO"):
                            colIndex.memo = column - 1;
                            break;
                        case headerText.includes("MAJOR FLAGS"):
                            colIndex.flags = column - 1;
                            break;
                    }
                }
                column++;
            };
            colIndex.set = true;
            column = 1;
            ordersTable.push(currentRow);
            row++;
        };
        debug(colIndex);
        return ordersTable;
    }

    // Flag totals will be set only for orders with (any) OP (change this?)
    let flagTotals = {
        flagTypes: ["Fraud Review", "Comment", "Tax Exempt", "Address Validation", "Sales Rep", "LOA Needed", "Low Gross Profit", "$0 Order", "Outside US48", "None"],
        "Fraud Review": 0,
        "Comment": 0,
        "Tax Exempt": 0,
        "Address Validation": 0,
        "Sales Rep": 0,
        "LOA Needed": 0,
        "Low Gross Profit": 0,
        "$0 Order": 0,
        "Outside US48": 0,
        "None": 0,
        "All": 0
    }

    const readOrders = () => {
        function Order() {
            this.so = "";
            this.url = "";
            this.op = "";
            this.memo = "";
            this.flags = {
                text: "",
                types: [],
                setFlagTypes: function () {
                    if (this.text.includes("Fraud Review:")) { this.types.push("Fraud Review") };
                    if (this.text.includes("Address Validation")) { this.types.push("Address Validation") };
                    if (this.text.includes("Sales Rep:")) { this.types.push("Sales Rep") };
                    if (this.text.includes("Large Order Approval")) { this.types.push("LOA Needed") };
                    if (this.text.includes("Customer Comment:")) { this.types.push("Comment") };
                    if (this.text.includes("Tax Exempt Review")) { this.types.push("Tax Exempt") };
                    if (this.text.includes("Low Gross Profit")) { this.types.push("Low Gross Profit") };
                    if (this.text.includes("$0 Order")) { this.types.push("$0 Order") };
                    if (this.text.includes("Outside the US48")) { this.types.push("Outside US48") };
                    if (this.text == ' \n') { this.types.push("None") };
                },
                getCommentType: function () {
                    let cmntType = "";
                    if (this.types.includes("Comment")) {
                        return cmntType;
                    } else { debug("Type is not comment or no comment found") }
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
        flagTotals = {
            flagTypes: ["Fraud Review", "Comment", "Tax Exempt", "Address Validation", "Sales Rep", "LOA Needed", "Low Gross Profit", "$0 Order", "Outside US48", "None"],
            "Fraud Review": 0,
            "Comment": 0,
            "Tax Exempt": 0,
            "Address Validation": 0,
            "Sales Rep": 0,
            "LOA Needed": 0,
            "Low Gross Profit": 0,
            "$0 Order": 0,
            "Outside US48": 0,
            "None": 0,
            "All": 0
        }
        for (let i = 0; i <= curTable.length - 1; i++) {
            if (curTable[i].op == userName) {
                curTable[i].flags.types.forEach((flag) => {
                    flagTotals[flag]++
                });
                flagTotals["All"]++
            }
        }
        console.log(flagTotals);
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

    let allBtns;
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
        function createListItem(text, id, scope) {
            const li = document.createElement("li");
            li.flagType = scope;
            li.innerHTML = text;
            li.id = id;
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

        const liFraud = createListItem("Fraud Review", "lifraud", "Fraud Review");
        const liCmt = createListItem("Comment", "licmt", "Comment");
        const liTax = createListItem("Tax Exempt", "litax", "Tax Exempt");
        const liAdd = createListItem("Address Validation", "liadd", "Address Validation");
        const liSR = createListItem("Sales Rep", "lisr", "Sales Rep");
        const liLOA = createListItem("LOA Needed", "liloa", "LOA Needed");
        const liLGR = createListItem("Low Gross Profit", "lilgr", "Low Gross Profit");
        const liZer = createListItem("$0 Order", "lizer", "$0 Order");
        const liUS48 = createListItem("Outside US48", "lius48", "Outside US48");
        const liNon = createListItem("None", "linon", "None");

        // The order here will determine default order
        allLis = [liCmt, liSR, liLOA, liAdd, liTax, liLGR, liZer, liUS48, liNon, liFraud];

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
            countp.innerHTML = `${text} (${flagTotals[scope]})`
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

        const btnAll = createButton("Open All Assigned", "All");
        // Default behavior is to set display to none if there are no "scope" orders in the list; no orders will be "All"
        btnAll.style.marginLeft = "0px";
        const btnNon = createButton("Open No Flags", "None");
        const btnFraud = createButton("Open Fraud Orders", "Fraud Review");
        const btnCmt = createButton("Open Comments", "Comment");
        const btnTax = createButton("Open Tax Exempts", "Tax Exempt");
        const btnAdd = createButton("Open Address Validation", "Address Validation");
        const btnSal = createButton("Open Sales Rep", "Sales Rep");
        const btnLOA = createButton("Open LOA Needed", "LOA Needed");
        const btnLGP = createButton("Open Low Gross Profit", "Low Gross Profit");
        const btnZer = createButton("Open $0 Orders", "$0 Order");
        const btnUS48 = createButton("Open !US48s", "Outside US48");
        allBtns = [btnAll, btnNon, btnFraud, btnCmt, btnTax, btnAdd, btnSal, btnLOA, btnLGP, btnZer, btnUS48]
        btnContainer.appendChild(selector);
        btnContainer.id = "btncontrol";
        allBtns.forEach((button) => {
            btnContainer.appendChild(button);
            addListeners(button);
        })
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
                    console.log(`The ${mutation.attributeName} attribute was modified.`);
                    console.log(mutation);
                    console.log(allBtns);
                    setTimeout(() => {
                        countOrders();
                        allBtns.forEach((button) => {
                            button.innerHTML = `<p>${button.textIn} (${flagTotals[button.flagType]})</p>`;
                        })
                        allLis.forEach((listem) => {
                            if (flagTotals[listem.flagType] > 0) {
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
    copyTable.innerHTML = `<table style="text-align: center; width: 2em; display: inline-block;"><thead><tr><th colspan="2" style="border: 1px solid black; background-color: #bdbdbd; text-align: center;">Copy To:</th></tr></thead><tbody><tr><td class="button" id="delbtn" style="border: 1px solid #508595; padding: 6px 3px; background-color: #e4eaf5; text-wrap: auto;cursor: pointer;user-select: none;">Delivery Instructions</td><td class="button" id="prodbtn" style="border: 1px solid #508595; padding: 6px 3px; background-color: #e4eaf5; text-wrap: auto;height: 86px;cursor: pointer;user-select: none;">Production Memo</td></tr><tr><td class="status" id="delrdy" style="border: 1px solid #508595; background-color: #f8f892;">Ready</td><td class="status" id="prodrdy" style="border: 1px solid #508595; background-color: #f8f892;">Ready</td></tr></tbody></table>`;
    document.querySelector("#custbody_customer_order_comments").after(copyTable);
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

// Create 'add to delivery instructions' button element
// const createDelInsBtn = () => {
//     const btn = document.createElement("button");
//     let copied = false;
//     const btnText = document.createElement("p");
//     btnText.innerHTML = "Copy Comment<br> to Delivery<br> Instructions";
//     btn.appendChild(btnText);
//     btn.style.padding = "3em 2px";
//     btn.style.height = "134px";
//     btn.style.position = "relative";
//     btn.style.display = "inline-flex";
//     btn.style.flexWrap = "wrap";
//     btn.style.alignContent = "center";
//     btn.style.left = "4px";
//     btn.style.bottom = "80px";
//     btn.style.backgroundColor = "#e4eaf5";
//     btn.style.border = "1px solid #508595";
//     btn.addEventListener("mouseenter", (event) => {
//         btn.style.backgroundColor = "#cddeff";
//     });
//     btn.addEventListener("mouseleave", (event) => {
//         btn.style.backgroundColor = "#e4eaf5";
//     });
//     btn.addEventListener("mousedown", (event) => {
//         btn.style.backgroundColor = "#4b88ff";
//     });
//     btn.addEventListener("mouseup", (event) => {
//         btn.style.backgroundColor = "#cddeff";
//     });
//     btn.onclick = () => {
//         copyToDelIns();
//         if (copied == false) {
//             btnText.innerHTML += "<br>(Done!)";
//             // btn.style.padding = "30px 2px";
//             btn.style.bottom = "89px";
//         };
//         copied = true;
//         return false;
//     };
//     btn.addEventListener("click", (event) => {
//         popupConfirm(event.clientX, event.clientY);
//     });
//     document.querySelector("#custbody_customer_order_comments").after(btn);
// };

const checkIP = () => {
    if (document.querySelector("#custbody78_fs_lbl_uir_label")) {
        const findIP = new RegExp(/(?:\d+\.){3}\d+/);
        try {
            const ipATag = isEd ? document.querySelector("#custbody78_fs_lbl_uir_label").nextElementSibling.firstElementChild.firstElementChild.firstElementChild.href : document.querySelector("#custbody78_fs_lbl_uir_label").nextElementSibling.firstElementChild.href;
            const ip = findIP.exec(ipATag)[0];
            debug(ipATag);
            debug(ip);
            const url = `https://ipapi.co/${ip}/json/`;
            // w = window.open("",'_blank', 'toolbar=no,titlebar=no,status=no,menubar=no,scrollbars=no,resizable=no,left=12000, top=12000,width=10,height=10,visible=none', ''); w.location.href = url; setTimeout(function() { w.close(); }, 6000)
            fetch(url)
                .then((response) => response.json())
                .then((data) => debug(data));
        } catch (error) {
            debug(error);
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
            // createDelInsBtn();
            createCopyTable();
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

// Creates a copy of the "New Note" button underneath the flags
const copyNoteButton = () => {
    try {
        console.log("Copying button...")
        const oldNote = document.querySelector("#newhist");
        const newNote = oldNote.cloneNode(true);
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
