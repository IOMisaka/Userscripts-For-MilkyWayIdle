// ==UserScript==
// @name         MyMWITools
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  my tool for Milky Way Idle
// @author       white
// @match        *://www.milkywayidle.com/*
// @match        *://test.milkywayidle.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.2/math.js
// ==/UserScript==

(() => {
	"use strict";

	let init_client_data = null;
	if (localStorage.getItem("initClientData")) {
		init_client_data = JSON.parse(localStorage.getItem("initClientData"));
	}

	let init_character_data = null;
	let actionList = null;

	let currentActionsList = [];
	let currentEquipmentMap = {};

	let memo = {};

	let price_data = null;
	if (localStorage.getItem("priceData")) {
		price_data = JSON.parse(localStorage.getItem("priceData"));
	}

	hookWS();

	function hookWS() {
		const dataProperty = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");
		const oriGet = dataProperty.get;
		const oriSend = WebSocket.prototype.send;
		//WebSocket.prototype.send = hookedSend;

		dataProperty.get = hookedGet;
		Object.defineProperty(MessageEvent.prototype, "data", dataProperty);

		function hookedGet() {
			const socket = this.currentTarget;
			if (!(socket instanceof WebSocket)) {
				return oriGet.call(this);
			}
			if (socket.url.indexOf("api.milkywayidle.com/ws") <= -1 && socket.url.indexOf("api-test.milkywayidle.com/ws") <= -1) {
				return oriGet.call(this);
			}
			const message = oriGet.call(this);
			Object.defineProperty(this, "data", { value: message }); // Anti-loop

			return handleGet(message);
		}
	}

	function handleGet(message) {
		let obj = JSON.parse(message);
		if (obj && obj.type === "init_character_data") {
			init_character_data = obj;
			currentActionsList = [...obj.characterActions];
			for (const item of obj.characterItems) {
				if (item.itemLocationHrid !== "/item_locations/inventory") {
					currentEquipmentMap[item.itemLocationHrid] = item;
				}
			}

			initiatePriceData();
			actionList = createActionList();
			console.log(actionList.length);

			addNavigationLinks();

		}
		else if (obj && obj.type === "init_client_data") {
			init_client_data = obj;
		}
		else if (obj && obj.type === "actions_updated") {

		}
		else if (obj && obj.type === "items_updated" && obj.endCharacterItems) {
			for (const item of obj.endCharacterItems) {
				if (item.itemLocationHrid !== "/item_locations/inventory") {
					if (item.count === 0) {
						currentEquipmentMap[item.itemLocationHrid] = null;
					} else {
						currentEquipmentMap[item.itemLocationHrid] = item;
					}
				}
			}
		}
		else if (obj && obj.type === "market_item_order_books_updated") {
			handleMarketUpdate(obj);
			console.log("Get price of " + getItemNameFromHrid(obj.marketItemOrderBooks.itemHrid), new Date(Date.now()).toLocaleString());
		}
		else if (obj && obj.type === "market_listings_updated") {

		}
		else if (obj && obj.type === "battle_unit_fetched") {

		}
		else if (obj && obj.type === "new_battle") {

		}
		else if (obj && obj.type === "battle_updated") {

		}
		else if (obj && obj.type === "battle_consumable_ability_updated") {

		}
		else if (obj && obj.type === "active_player_count_updated") {

		}
		else if (obj && obj.type === "action_type_consumable_slots_updated") {

		}
		else if (obj && obj.type === "chat_message_received") {

		}
		else if (obj && obj.type === "action_completed") {
			let endCharacterSkills = obj.endCharacterSkills;
			for (const skill of init_character_data.characterSkills) {
				for (const updatedSkill of endCharacterSkills) {
					if (skill.skillHrid === updatedSkill.skillHrid) {
						skill.experience = updatedSkill.experience;
						skill.level = updatedSkill.level;
						break;
					}
				}
			}
		}
		else if (obj && obj.type === "loot_opened") {

		}
		else if (obj && obj.type === "pong") {

		}
		else if (obj && obj.type === "profile_shared") {

		}
		else if (obj && obj.type === "info") {

		}
		else if (obj && obj.type === "community_buffs_updated") {

		}
		else if (obj && obj.type === "character_stats_updated") {

		}
		else if (obj && obj.type === "character_info_updated") {

		}
		else if (obj && obj.type === "guild_characters_updated") {

		}
		else if (obj && obj.type === "party_list_updated") {

		}
		else if (obj && obj.type === "quests_updated") {

		}
		else {
			console.log("unhandled_get:");
			console.log(obj)
		}
		return message;
	}
	const getEnhancementBuffBonus = (enhancementLevel) => {
		const itemEnhanceLevelToBuffBonusMap = {
			0: 0,
			1: 2,
			2: 4.2,
			3: 6.6,
			4: 9.2,
			5: 12.0,
			6: 15.0,
			7: 18.2,
			8: 21.6,
			9: 25.2,
			10: 29.0,
			11: 33.0,
			12: 37.2,
			13: 41.6,
			14: 46.2,
			15: 51.0,
			16: 56.0,
			17: 61.2,
			18: 66.6,
			19: 72.2,
			20: 78.0,
		};
		return itemEnhanceLevelToBuffBonusMap[enhancementLevel] / 100;
	}

	function numberFormatter(num, digits = 1) {
		if (num === null || num === undefined) {
			return null;
		}
		if (num < 0) {
			return "-" + numberFormatter(-num);
		}
		const lookup = [
			{ value: 1, symbol: "" },
			{ value: 1e3, symbol: "k" },
			{ value: 1e6, symbol: "M" },
			{ value: 1e9, symbol: "B" },
		];
		const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
		let item = lookup
			.slice()
			.reverse()
			.find(function(item) {
				return num >= item.value;
			});
		return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
	}

	function timeReadable(sec) {
		if (sec >= 86400) {
			return Number(sec / 86400).toFixed(1) + " d";
		}
		const d = new Date(Math.round(sec * 1000));
		function pad(i) {
			return ("0" + i).slice(-2);
		}
		let str = d.getUTCHours() + "h " + pad(d.getUTCMinutes()) + "m " + pad(d.getUTCSeconds()) + "s";
		return str;
	}

	function getToolsSpeedBuffByActionHrid(actionHrid) {
		let totalBuff = 0;
		const actionTypeToToolsSpeedBuffNamesMap = {
			"/action_types/brewing": "brewingSpeed",
			"/action_types/cheesesmithing": "cheesesmithingSpeed",
			"/action_types/cooking": "cookingSpeed",
			"/action_types/crafting": "craftingSpeed",
			"/action_types/foraging": "foragingSpeed",
			"/action_types/milking": "milkingSpeed",
			"/action_types/tailoring": "tailoringSpeed",
			"/action_types/woodcutting": "woodcuttingSpeed",
			"/action_types/alchemy": "alchemySpeed",
		};
		for (const item of init_character_data.characterItems) {
			if (item.itemLocationHrid.includes("_tool")) {
				const buffName = actionTypeToToolsSpeedBuffNamesMap[init_client_data.actionDetailMap[actionHrid].type];
				const enhanceBonus = 1 + getEnhancementBuffBonus(item.enhancementLevel);
				const buff = init_client_data.itemDetailMap[item.itemHrid].equipmentDetail.noncombatStats[buffName] || 0;
				totalBuff += buff * enhanceBonus;
			}
		}
		return totalBuff;
	}

	function getHouseLevelByActionHrid(actionHrid) {
		const actionTypeToHouseNamesMap = {
			"/action_types/alchemy": "/house_rooms/laboratory",
			"/action_types/brewing": "/house_rooms/brewery",
			"/action_types/cheesesmithing": "/house_rooms/forge",
			"/action_types/cooking": "/house_rooms/kitchen",
			"/action_types/crafting": "/house_rooms/workshop",
			"/action_types/enhancing": "/house_rooms/observatory",
			"/action_types/foraging": "/house_rooms/garden",
			"/action_types/milking": "/house_rooms/dairy_barn",
			"/action_types/tailoring": "/house_rooms/sewing_parlor",
			"/action_types/woodcutting": "/house_rooms/log_shed"
		};
		const houseName = actionTypeToHouseNamesMap[init_client_data.actionDetailMap[actionHrid].type];
		if (!houseName) {
			return 0;
		}
		const house = init_character_data.characterHouseRoomMap[houseName];
		if (!house) {
			return 0;
		}
		return house.level;
	}

	function addNavigationLinks() {
		const links = [
			{ name: "Enhancelator", url: "https://doh-nuts.github.io/Enhancelator/" },
			{ name: "MWIApiCharts", url: "https://prozhong.github.io/MWIApiCharts/" },
			{ name: "Cowculator", url: "https://mwisim.github.io/cowculator/" },
			{ name: "MWISim", url: "https://shykai.github.io/MWICombatSimulatorTest/dist/" }
		];

		const createLink = (name, url) => {
			const div = document.createElement("div");
			div.setAttribute("class", "NavigationBar_minorNavigationLink__31K7Y");
			div.style.color = "white";
			div.innerHTML = name;
			div.addEventListener("click", () => {
				unsafeWindow.open(url, "_blank");
			});
			return div;
		};

		const waitForNavi = () => {
			const targetNode = document.querySelector("div.NavigationBar_minorNavigationLinks__dbxh7");
			if (targetNode) {
				links.forEach(link => {
					const linkElement = createLink(link.name, link.url);
					targetNode.insertAdjacentElement("afterbegin", linkElement);
				});
				addUpdateButton();
			} else {
				setTimeout(waitForNavi, 200);
			}
		};

		waitForNavi();
	}

	function addUpdateButton() {
		const targetNode = document.querySelector("div.NavigationBar_minorNavigationLinks__dbxh7");
		if (targetNode) {
			let div3 = document.createElement("div");
			div3.className = "NavigationBar_minorNavigationLink__31K7Y";
			div3.id = "action_Profit_Navi";
			div3.style.color = "white";
			div3.textContent = "Calculate Profit";
			div3.addEventListener("click", () => {
				let panel = document.getElementById('action_Profit_Panel');
				if (!panel) {
					div3.innerHTML = "Loading";
					div3.disabled = true;
					calculateActionProfit(actionList).then(() => {
						panel = document.getElementById('action_Profit_Panel');
						div3.innerText = 'Hide';
						panel.style.display = 'block';
					});
				} else {
					if (panel.style.display === 'none' || panel.style.display === '') {
						div3.innerHTML = "Hide";
						panel.style.display = 'block';
					} else {
						div3.innerHTML = "Show";
						panel.style.display = 'none';
					}
				}
			})
			targetNode.insertAdjacentElement("afterbegin", div3);
		} else {
			setTimeout(addUpdateButton, 200);
		}
	}

	function handleMarketUpdate(message) {
		let marketData = GM_getValue("market_data");
		if (!marketData) {
			marketData = {};
		}
		const itemHrid = message.marketItemOrderBooks.itemHrid;
		const name = init_client_data.itemDetailMap[itemHrid].name;
		const orderBooks = message.marketItemOrderBooks.orderBooks;

		for (let i = 0; i < orderBooks.length; i++) {
			const asks = orderBooks[i]?.asks;
			const bids = orderBooks[i]?.bids;

			if (asks?.length) {
				price_data[itemHrid].asks[i] = asks[0].price;
			} else {
				price_data[itemHrid].asks[i] = null;
			}
			if (bids?.length) {
				price_data[itemHrid].bids[i] = bids[0].price;
			} else {
				price_data[itemHrid].bids[i] = null;
			}
		}
		price_data[itemHrid].time = Date.now();
		localStorage.setItem("priceData", JSON.stringify(price_data));

		let detail = {};
		detail.itemHrid = itemHrid;
		detail.name = name;
		detail.orderBooks = orderBooks;
		detail.time = Date.now();
		marketData[itemHrid] = detail;
		GM_setValue("market_data", marketData);
	}
	/*
	* "/action_types/milking"
	*/
	function getEquipEffecieny(actionType) {
		if(!mwi?.game){
			return;
		}
		let gearEfficiency = 0.129; // Default efficiency for all actions
		if (init_character_data.characterHouseRoomMap["/house_rooms/observatory"]) {
			gearEfficiency += getEnhancementBuffBonus(init_character_data.characterHouseRoomMap["/house_rooms/observatory"].enhancementLevel);
		}
		return gearEfficiency * (1 + teaCatalytic); // Apply teaCatalytic bonus to the overall efficiency
	}
	function calculateActionProfit(actionList) {
		const gearEfficiencies = {
			milking: 0.112, foraging: 0.112, woodcutting: 0.112,
			cheesesmithing: 0.112, crafting: 0.112, tailoring: 0.112,
			cooking: 0.112, brewing: 0.112, alchemy: 0.12126
		};

		let itemSource = {};
		let profitList = [];

		const communityGathering = 0,
			communityProduction = 0;
		const drinkConcentration = getDrinkConcentration();
		const teaArtisan = 0.1 * (1 + drinkConcentration),
			teaEfficiency = 0.1 * (1 + drinkConcentration),
			teaGathering = 0.15 * (1 + drinkConcentration),
			teaGourmet = 0.12 * (1 + drinkConcentration),
			teaCatalytic = 0.05 * (1 + drinkConcentration);
		const teaDuration = 300 / drinkConcentration;

		const catalystSuccessBuff = 0.15, primeCatalystSuccessBuff = 0.25;
		let successBonus = 0;

		for (const item of Object.values(init_client_data.itemDetailMap)) {
			itemSource[item.hrid] = [];
			for (let i = 0; i <= 20; i++) {
				const askPrice = getAsk(item.hrid, i);
				if (item.hrid === "/items/coin" || (askPrice > 0 && item.isTradable)) {
					itemSource[item.hrid][i] = itemSource[item.hrid][i] ?? []; // Initialize if undefined
					itemSource[item.hrid][i].push({ sourceName: "market", cost: askPrice, timeCost: 0 });
				}
			}
		}

		return new Promise((resolve) => {
			processActions(actionList).then(() => {
				profitList.sort((a, b) => b.profitPerHour - a.profitPerHour);
				display(profitList);
				resolve(profitList);
			});
		});

		function getDrinkConcentration() {
			for (const item of init_character_data.characterItems) {
				if (item.itemLocationHrid === "/item_locations/pouch") {
					if (item.itemHrid === "/items/guzzling_pouch") {
						const enhanceBonus = 1 + getEnhancementBuffBonus(item.enhancementLevel);
						const buff = init_client_data.itemDetailMap[item.itemHrid].equipmentDetail.noncombatStats.drinkConcentration || 0;
						return buff * enhanceBonus;
					}
				}
			}
		}

		function getItemSource(item) {
			if (item.name && !item.itemHrid) {
				item.itemHrid = getItemHridFromName(item.name);
			}
			return itemSource[item.itemHrid][item.enhancementLevel || 0];
		}

		function calculateBestItemSources(items, income, baseTime) {
			let bestCombination = null;
			let maxProfitPerTime = -Infinity;
			let minAdjustedCost = Infinity;
			let fallbackCombination = null;
			const defaultProfitPerTime = 2000000 / 3600;

			// Helper function to calculate combinations recursively
			function findBestCombination(index, selectedSources, totalCost, totalTimeCost) {
				if (index === items.length) {
					// Calculate profit and profit per timeCost
					const profit = income - totalCost;
					const totalTime = baseTime + totalTimeCost;
					const profitPerTime = profit / totalTime;

					// Update the best combination if this one is better
					if (profitPerTime >= defaultProfitPerTime) {
						if (profitPerTime > maxProfitPerTime) {
							maxProfitPerTime = profitPerTime;
							bestCombination = {
								selectedSources: [...selectedSources],
								totalProfit: profit,
								totalCost: totalCost,
								totalTimeCost: totalTime
							};
						}
					} else {
						// Calculate adjusted cost for fallback
						const adjustedCost = totalCost + totalTime * defaultProfitPerTime;
						if (adjustedCost < minAdjustedCost) {
							minAdjustedCost = adjustedCost;
							fallbackCombination = {
								selectedSources: [...selectedSources],
								totalProfit: profit,
								totalCost: totalCost,
								totalTimeCost: totalTime
							};
						}
					}
					return;
				}

				const item = items[index];
				for (const source of getItemSource(item)) {
					const { sourceName, cost, timeCost } = source;
					findBestCombination(
						index + 1,
						[...selectedSources, { itemName: item.name, sourceName }],
						totalCost + cost * item.count,
						totalTimeCost + timeCost * item.count,
					);
				}
			}

			// Start the recursive search
			findBestCombination(0, [], 0, 0);

			return bestCombination || fallbackCombination;
		}

		function processActions(actionList) {
			return new Promise((resolve) => {
				const chunk = 100;
				let index = 0;

				function doChunk() {
					let cnt = chunk;
					while (cnt-- && index < actionList.length) {
						const action = actionList[index];
						calculate(action);
						++index;
					}
					if (index < actionList.length) {
						// Continue processing asynchronously
						setTimeout(doChunk, 0);
					} else {
						// Resolve the promise when all tasks are done
						resolve();
					}
				}

				doChunk();
			});
		}

		function display(data) {
			const rowsPerPage = 10;
			let tableContainer = document.getElementById('table-container');

			if (!tableContainer) {
				tableContainer = document.createElement('div');
				tableContainer.id = 'table-container';
			}

			tableContainer.innerHTML = ''; // Clear previous table
			let currentPage = 1;
			const totalPages = Math.ceil(data.length / rowsPerPage);

			// Create filter inputs
			const filterContainer = document.createElement('div');
			filterContainer.style.display = 'flex';
			filterContainer.style.marginBottom = '10px';

			// Create a dropdown container for skills
			const skillDropdown = document.createElement('details');
			skillDropdown.style.marginRight = '10px';

			const summary = document.createElement('summary');
			summary.textContent = 'Select Skills';
			summary.style.cursor = 'pointer';
			skillDropdown.appendChild(summary);

			const skillList = document.createElement('div');
			skillList.style.border = '1px solid #ccc';
			skillList.style.padding = '10px';
			skillList.style.position = 'absolute';
			skillList.style.backgroundColor = '#000';
			skillList.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
			skillList.style.zIndex = '10000';

			const skills = ['Milking', 'Foraging', 'Woodcutting', 'Cheesesmithing', 'Crafting', 'Tailoring', 'Cooking', 'Brewing', 'Alchemy', 'Enhancing'];

			skills.forEach(skill => {
				const label = document.createElement('label');
				label.style.display = 'block';

				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.value = skill;
				checkbox.checked = true;

				label.appendChild(checkbox);
				label.appendChild(document.createTextNode(skill));
				skillList.appendChild(label);
			});

			skillDropdown.appendChild(skillList);

			const rateFilter = document.createElement('input');
			rateFilter.type = 'number';
			rateFilter.placeholder = 'Min Rate';
			rateFilter.style.marginRight = '10px';
			rateFilter.value = '1.03'; // Set default value to 1.03

			const nameFilter = document.createElement('input');
			nameFilter.type = 'text';
			nameFilter.placeholder = 'Filter by Name';
			nameFilter.style.marginRight = '10px';

			const selectedSkills = Array.from(skillList.querySelectorAll('input[type="checkbox"]:checked'))
				.map(checkbox => checkbox.value);
			const minRate = parseFloat(rateFilter.value) || 0;

			const filterButton = document.createElement('button');
			filterButton.textContent = 'Filter';

			filterContainer.appendChild(skillDropdown);
			filterContainer.appendChild(rateFilter);
			filterContainer.appendChild(nameFilter);
			filterContainer.appendChild(filterButton);
			tableContainer.appendChild(filterContainer);

			console.info(itemSource);

			const json = data.map(a => ({ ...a, profitPerHour: numberFormatter(a.profitPerHour) }));
			console.info(json);

			// Initial render
			let filteredData = json.filter(item => {
				const matchesSkill = selectedSkills.length === 0 || selectedSkills.includes(item.skill);
				const matchesRate = item.rate >= minRate;
				return matchesSkill && matchesRate;
			});
			renderTable(filteredData, currentPage);
			renderPagination();

			// Filter logic
			filterButton.addEventListener('click', () => {
				const selectedSkills = Array.from(skillList.querySelectorAll('input[type="checkbox"]:checked'))
					.map(checkbox => checkbox.value);
				const minRate = parseFloat(rateFilter.value) || 0;
				const nameFilterValue = (nameFilter.value || '').trim().toLowerCase(); // Trim spaces and convert to lowercase

				filteredData = json.filter(item => {
					const matchesSkill = selectedSkills.length === 0 || selectedSkills.includes(item.skill);
					const matchesRate = item.rate >= minRate;
					const matchesName = item.name.toLowerCase().includes(nameFilterValue);
					return matchesSkill && matchesRate && matchesName;
				});

				renderTable(filteredData, currentPage);
				renderPagination();
			});

			let panel = document.getElementById('action_Profit_Panel');
			if (!panel) {
				panel = createPanel();
				document.body.appendChild(panel);
			} else {
				const scrollWrapper = document.querySelector('.scroll-wrapper');
				scrollWrapper.innerHTML = '';
				scrollWrapper.appendChild(tableContainer);
			}

			function createPanel() {
				const panel = document.createElement('div');
				panel.id = 'action_Profit_Panel';
				panel.style = `
			            color: white; position: fixed; top: 50%; left: 50%;
			            transform: translate(-50%, -50%); background-color: #131419;
			            border: 1px solid #98a7e9; border-radius: 10px; z-index: 5000;
			            max-width: 90%; max-height: 80%; overflow: auto;`;

				const header = createDraggableHeader(panel);
				panel.appendChild(header);

				const updateButton = createUpdateButton(panel);
				panel.appendChild(updateButton);

				const scrollWrapper = document.createElement('div');
				scrollWrapper.className = 'scroll-wrapper';
				scrollWrapper.style = "overflow: auto; padding: 20px; max-height: 70vh;";
				scrollWrapper.appendChild(tableContainer);

				panel.appendChild(scrollWrapper);

				addTableStyles();

				return panel;
			}

			function createDraggableHeader(panel) {
				const header = document.createElement('div');
				header.style = `
			            background-color: #1a1b22; padding: 10px; cursor: move;
			            border-bottom: 1px solid #98a7e9; text-align: center;`;
				header.textContent = "Action Profit";

				let isDragging = false, offsetX = 0, offsetY = 0;

				header.addEventListener('mousedown', (e) => {
					e.preventDefault();
					isDragging = true;
					offsetX = e.clientX - panel.offsetLeft;
					offsetY = e.clientY - panel.offsetTop;
					panel.style.cursor = 'grabbing';
				});

				document.addEventListener('mousemove', (e) => {
					if (isDragging) {
						e.preventDefault();

						panel.style.left = `${e.clientX - offsetX}px`;
						panel.style.top = `${e.clientY - offsetY}px`;
					}
				});

				document.addEventListener('mouseup', () => {
					isDragging = false;
					panel.style.cursor = 'default';
				});

				return header;
			}

			function createUpdateButton() {
				const button = document.createElement('button');
				button.innerText = 'Update';
				button.style = `
			            position: absolute; top: 10px; right: 10px;
			            background-color: #ff4d4d; color: white; border: none;
			            border-radius: 5px; padding: 5px 10px; cursor: pointer;`;

				button.addEventListener('click', () => {
					button.innerText = 'Loading';
					button.disabled = true;
					calculateActionProfit(actionList).then(() => {
						button.innerText = 'Update';
						button.disabled = false;
					});
				});

				return button;
			}

			function addTableStyles() {
				const style = document.createElement('style');
				style.innerHTML = `
			            table { user-select: text; width: 100%; border-collapse: collapse; }
			            th, td { user-select: text; border: 1px solid #000; padding: 8px; text-align: center;
			                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
			            .clickable { cursor: pointer; user-select: none; }
			            .details div { user-select: text; white-space: nowrap; text-overflow: ellipsis; }`;
				document.head.appendChild(style);
			}

			function renderTable(data, page) {
				tableContainer.innerHTML = ''; // Clear previous content
				tableContainer.appendChild(filterContainer); // Re-add filters

				const table = document.createElement('table');
				const headers = [
					{ display: "Name", key: "name" },
					{ display: "Skill", key: "skill" },
					{ display: "Profit Per Hour", key: "profitPerHour" },
					{ display: "Rate", key: "rate" },
					{ display: "Inputs", key: "inputs" },
					{ display: "Outputs", key: "outputs" },
					{ display: "Time Cost", key: "timeCost" }
				];

				const start = (page - 1) * rowsPerPage;
				const end = start + rowsPerPage;
				const pageData = data.slice(start, end);

				const thead = document.createElement('thead');
				const headerRow = document.createElement('tr');
				headers.forEach(header => {
					const th = document.createElement('th');
					th.textContent = header.display;

					// Add click event listener for "Inputs" and "Outputs" headers
					if (header.key === "inputs" || header.key === "outputs") {
						th.addEventListener('click', () => {
							const cells = table.querySelectorAll('td[data-key="inputs"] .details, td[data-key="outputs"] .details');
							const allHidden = Array.from(cells).every(details => details.style.display === 'none');
							cells.forEach(details => {
								details.style.display = allHidden ? 'block' : 'none';
							});
						});
					}

					headerRow.appendChild(th);
				});
				thead.appendChild(headerRow);

				const tbody = document.createElement('tbody');
				pageData.forEach(item => {
					const row = document.createElement('tr');

					headers.forEach(header => {
						const cell = document.createElement('td');
						cell.setAttribute('data-key', header.key);

						if (header.key === "inputs" || header.key === "outputs") {
							if (header.key === "inputs") {
								cell.textContent = numberFormatter(item["cost"]);
							}
							if (header.key === "outputs") {
								cell.textContent = numberFormatter(item["income"]);
							}
							const details = document.createElement('div');
							details.classList.add('details');
							details.style.display = 'none'; // Initially hidden
							if (!item[header.key].length) {
								const element = document.createElement('div');
								element.textContent = 'null';
								details.appendChild(element)
							} else {
								details.appendChild(formatNestedArray(item[header.key]));
							}

							cell.appendChild(details);
						} else {
							if (header.key === "timeCost") {
								cell.textContent = timeReadable(item[header.key]);
							} else {
								cell.textContent = item[header.key];
							}
						}

						if (header.key === "name") {
							cell.style.cursor = 'pointer'; // Optional: Add a pointer cursor for better UX
							cell.addEventListener('click', () => {
								const detailsCells = row.querySelectorAll('td[data-key="inputs"] .details, td[data-key="outputs"] .details');
								detailsCells.forEach(details => {
									details.style.display = details.style.display === 'none' ? 'block' : 'none';
								});
							});
						}

						row.appendChild(cell);
					});
					tbody.appendChild(row);
				});

				table.appendChild(thead);
				table.appendChild(tbody);
				tableContainer.appendChild(table);
			}

			function renderPagination() {
				const pagination = document.createElement('div');
				pagination.id = 'pagination';

				const prevButton = document.createElement('button');
				prevButton.textContent = 'Previous';
				prevButton.disabled = currentPage === 1;
				prevButton.addEventListener('click', () => {
					if (currentPage > 1) {
						currentPage--;
						renderTable(filteredData, currentPage)
						renderPagination();
					}
				});

				const nextButton = document.createElement('button');
				nextButton.textContent = 'Next';
				nextButton.disabled = currentPage === totalPages;
				nextButton.addEventListener('click', () => {
					if (currentPage < totalPages) {
						currentPage++;
						renderTable(filteredData, currentPage)
						renderPagination();
					}
				});

				pagination.appendChild(prevButton);
				pagination.appendChild(nextButton);
				tableContainer.appendChild(pagination);
			}

			function formatNestedArray(array) {
				const container = document.createElement('div');
				array.forEach(item => {
					const element = document.createElement('div');
					if (Array.isArray(item)) {
						// Recursively format nested arrays
						element.appendChild(formatNestedArray(item));
					} else {
						element.textContent = item;
					}
					element.style.display = 'block'; // Ensure each element takes a single line
					container.appendChild(element);
				});
				return container;
			}
		}

		function calculate(action) {
			if (action.hrid === "/actions/enhancing/enhance") {
				caculateEnhancingAction(action);
				return;
			}

			let level = 0, speed = 0, houseLevel = 0, efficiency = 0, quantity = 0;
			let useArtisanTea = false, useEfficiencyTea = false, useGatheringTea = false, useGourmetTea = false, useCatalyticTea = false;
			let income = 0, inputCost = 0, successRate = 1, teaCost = 0;
			let selectedSources = null;
			let skill = init_client_data.skillDetailMap[action.levelRequirement.skillHrid].name;
			let profitph = 0;

			for (const skill of init_character_data.characterSkills) {
				if (skill.skillHrid === action.levelRequirement.skillHrid) {
					level = skill.level;
					break;
				}
			}

			houseLevel = getHouseLevelByActionHrid(action.hrid);
			speed += getToolsSpeedBuffByActionHrid(action.hrid);

			switch (skill) {
				case 'Milking':
					useGatheringTea = true;
					useEfficiencyTea = true;
					quantity += communityGathering;
					efficiency += gearEfficiencies.milking;
					break;
				case 'Foraging':
					useGatheringTea = true;
					useEfficiencyTea = true;
					quantity += communityGathering;
					efficiency += gearEfficiencies.foraging;
					break;
				case 'Woodcutting':
					useGatheringTea = true;
					useEfficiencyTea = true;
					quantity += communityGathering;
					efficiency += gearEfficiencies.woodcutting;
					break;
				case 'Cheesesmithing':
					useArtisanTea = true;
					useEfficiencyTea = true;
					efficiency += gearEfficiencies.cheesesmithing + communityProduction;
					break;
				case 'Crafting':
					useArtisanTea = true;
					useEfficiencyTea = true;
					efficiency += gearEfficiencies.crafting + communityProduction;
					break;
				case 'Tailoring':
					useArtisanTea = true;
					useEfficiencyTea = true;
					efficiency += gearEfficiencies.tailoring + communityProduction;
					break;
				case 'Cooking':
					useArtisanTea = false;
					useGourmetTea = true;
					useEfficiencyTea = true;
					efficiency += gearEfficiencies.cooking + communityProduction;
					break;
				case 'Brewing':
					useArtisanTea = true;
					useEfficiencyTea = false;
					useGourmetTea = true;
					efficiency += gearEfficiencies.brewing + communityProduction;
					break;
				case 'Alchemy':
					useCatalyticTea = true;
					useEfficiencyTea = true;
					efficiency += gearEfficiencies.alchemy + communityProduction;
					break;
			}

			if (action.type === "/action_types/alchemy") {
				if (level < action.levelRequirement.level) {
					successBonus = (-0.9 * (1 - level / action.levelRequirement.level) + teaCatalytic);
				}
				else {
					successBonus = teaCatalytic;
				}
			} else if (level < action.levelRequirement.level) {
				return;
			};

			efficiency += 0.01 * Math.max(level - action.levelRequirement.level, 0) + 0.015 * houseLevel + (useEfficiencyTea ? teaEfficiency : 0);
			let timeCost = action.baseTimeCost / 1000000000 / (1 + efficiency) / (1 + speed);

			const teas = [
				{ teaName: "Artisan Tea", teaUsage: useArtisanTea, defaultPrice: 1500 },
				{ teaName: "Efficiency Tea", teaUsage: useEfficiencyTea, defaultPrice: 1000 },
				{ teaName: "Gathering Tea", teaUsage: useGatheringTea, defaultPrice: 500 },
				{ teaName: "Gourmet Tea", teaUsage: useGourmetTea, defaultPrice: 500 },
				{ teaName: "Catalytic Tea", teaUsage: useCatalyticTea, defaultPrice: 1500 },
			];

			teas.forEach(tea => {
				if (tea.teaUsage) {
					const hrid = getItemHridFromName(tea.teaName);
					const askPrice = getAsk(hrid);
					const teaPrice = askPrice > 0 ? askPrice : tea.defaultPrice;

					teaCost += teaPrice / teaDuration * timeCost;
				}
			});

			let outputItems = [];
			if (action.outputItems) {
				action.outputItems.forEach(item => {
					const bid = getBid(item.itemHrid, item.enhancementLevel ?? 0);
					const vendor = getVendor(item.itemHrid);
					const count = item.count * (1 + (useGatheringTea ? teaGathering : useGourmetTea ? teaGourmet : 0) + quantity);
					outputItems.push({
						itemHrid: item.itemHrid,
						name: item.name || init_client_data.itemDetailMap[item.itemHrid].name,
						count: count,
						...(item.enhancementLevel && { enhancementLevel: item.enhancementLevel })
					});
					income += Math.max(bid - Math.floor(0.02 * bid), vendor) * count;

				});
			}

			if (action.dropTable) {
				action.dropTable.forEach(item => {
					const bid = getBid(item.itemHrid);
					const vendor = getVendor(item.itemHrid);
					const count = item.dropRate * (item.minCount + item.maxCount) / 2 * (1 + (useGatheringTea ? teaGathering : useGourmetTea ? teaGourmet : 0) + quantity);
					outputItems.push({
						itemHrid: item.itemHrid,
						name: item.name || init_client_data.itemDetailMap[item.itemHrid].name,
						count: count
					});
					income += Math.max(bid - Math.floor(0.02 * bid), vendor) * count;
				});
			}

			let inputItems = [];
			if (action.inputItems) {
				action.inputItems.forEach(item => {
					if (useArtisanTea) {
						inputItems.push({
							itemHrid: item.itemHrid,
							name: item.name || init_client_data.itemDetailMap[item.itemHrid].name,
							count: item.count * (1 - teaArtisan)
						});
					} else {
						inputItems.push({
							itemHrid: item.itemHrid,
							name: item.name || init_client_data.itemDetailMap[item.itemHrid].name,
							count: item.count,
							...(item.enhancementLevel && { enhancementLevel: item.enhancementLevel })
						});
					}
				});
			}

			if (action.type === "/action_types/alchemy") {
				successRate = Math.min(1, (1 + successBonus) * action.successRate);
				let successRateC1 = Math.min(1, (1 + successBonus + catalystSuccessBuff) * action.successRate);
				let successRateC2 = Math.min(1, (1 + successBonus + primeCatalystSuccessBuff) * action.successRate);

				let catalystCost = 0;
				if (action.name.includes("(Coinify)")) catalystCost = getAsk(getItemHridFromName("Catalyst Of Coinification"));
				else if (action.name.includes("(Decompose)")) catalystCost = getAsk(getItemHridFromName("Catalyst Of Decomposition"));
				else if (action.name.includes("(Transmute)")) catalystCost = getAsk(getItemHridFromName("Catalyst Of Transmutation"));
				let primeCatalystCost = getAsk(getItemHridFromName("Prime Catalyst"));

				let useC1 = false;
				let useC2 = false;
				if (income * (successRateC1 - successRate) > successRateC1 * catalystCost) {
					useC1 = true;
					if (income * (successRateC2 - successRateC1) > successRateC2 * primeCatalystCost - successRateC1 * catalystCost) {
						useC1 = false;
						useC2 = true;
					}
				} else if (income * (successRateC2 - successRate) > successRateC2 * primeCatalystCost) {
					useC2 = true;
				}
				successRate = useC1 ? successRateC1 : useC2 ? successRateC2 : successRate;

				income = 0;
				for (const item of outputItems) {
					const bid = getBid(item.itemHrid);
					const vendor = getVendor(item.itemHrid);
					item.count *= successRate;
					income += Math.max(bid - Math.floor(0.02 * bid), vendor) * item.count;
				}
				if (useC1) {
					if (action.name.includes("(Coinify)")) inputItems.push({ itemHrid: getItemHridFromName("Catalyst Of Coinification"), name: "Catalyst Of Coinification", count: successRate });
					else if (action.name.includes("(Decompose)")) inputItems.push({ itemHrid: getItemHridFromName("Catalyst Of Decomposition"), name: "Catalyst Of Decomposition", count: successRate });
					else if (action.name.includes("(Transmute)")) inputItems.push({ itemHrid: getItemHridFromName("Catalyst Of Transmutation"), name: "Catalyst Of Transmutation", count: successRate });
				} else if (useC2) inputItems.push({ itemHrid: getItemHridFromName("Prime Catalyst"), name: "Prime Catalyst", count: successRate });
			}

			//remove same item in input[] and output[];
			//if before catalyst added, it ignores case where catalyst should be used and removed when transmute catalysts,
			//if after catalyst added, it ignores case where income should be recalculated when transmute catalysts,
			//seems the same for that catalysts are rarely used when transmute catalysts for it nearly double the cost
			const sameItem = inputItems.filter(e1 => outputItems.some(e2 => e1.itemHrid === e2.itemHrid)).filter(e => !e.enhancementLevel);
			for (const item of sameItem) {
				const input = inputItems.find(e => e.itemHrid === item.itemHrid);
				const output = outputItems.find(e => e.itemHrid === item.itemHrid);
				if (input && output) {
					if (input.count > output.count) {
						input.count = input.count - output.count;
						outputItems = outputItems.filter(item => item !== output);
					} else if (input.count < output.count) {
						output.count = output.count - input.count;
						inputItems = inputItems.filter(item => item !== input);
					} else if (input.count === output.count) {
						inputItems = inputItems.filter(item => item !== input);
						outputItems = outputItems.filter(item => item !== output);
					}
				} else {
					//never touched
					console.error(action, sameItem);
				}
			}

			income = 0;
			for (const item of outputItems) {
				const bid = getBid(item.itemHrid, item.enhancementLevel ?? 0);
				const vendor = getVendor(item.itemHrid);
				income += Math.max(bid - Math.floor(0.02 * bid), vendor) * item.count;
			}

			if (action.inputItems) {
				if (action.upgradeItemHrid) {
					if (action.upgradeItem) {
						inputItems.push(action.upgradeItem);
					} else {
						inputItems.push({ name: init_client_data.itemDetailMap[action.upgradeItemHrid].name, itemHrid: action.upgradeItemHrid, count: 1 });
					}
				}

				for (const item of inputItems) {
					if (!getItemSource(item)) {
						return;
					}
				}

				const result = calculateBestItemSources(inputItems, income - teaCost, timeCost);
				if (!result) {
					console.log(action);
					return;
				}
				profitph = result.totalProfit / result.totalTimeCost * 3600;
				selectedSources = result.selectedSources;
				inputCost = result.totalCost;
				timeCost = result.totalTimeCost;
			} else {
				profitph = (income - teaCost) / timeCost * 3600;
			}

			if (outputItems.length === 1) {
				const item = outputItems[0];
				const name = item.name;
				const count = item.count;
				const itemHrid = item.itemHrid;
				const enhancementLevel = item.enhancementLevel || 0;

				if (name != "Coin") {
					itemSource[itemHrid][enhancementLevel] = itemSource[itemHrid][enhancementLevel] ?? []; // Initialize if undefined
					itemSource[itemHrid][enhancementLevel].push({ sourceName: action.name, cost: (teaCost + inputCost) / count, timeCost: timeCost / count })
				}
			}

			const inputs = [];
			if (inputItems) {
				inputItems.forEach(item => {
					const source = selectedSources.find(source => source.itemName === item.name).sourceName;
					if (source !== "market") {
						inputs.push([
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}` : ''}@ ${source}`,
							...profitList.find(action => action.name === source).inputs
						]);
					} else {
						inputs.push(
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}@ ${numberFormatter(getAsk(item.itemHrid, item.enhancementLevel))}` :
								`@ ${numberFormatter(getAsk(item.itemHrid))}`}`
						);
					}
				})
			};
			const outputs = [];
			if (outputItems) {
				outputItems.forEach(item => {
					if (item.count >= 0.01) {
						outputs.push(
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}@ ${numberFormatter(getBid(item.itemHrid, item.enhancementLevel))}` :
								`@ ${numberFormatter(getBid(item.itemHrid))}`}`
						);
					} else {
						outputs.push(`${item.count.toFixed(6)}* ${item.name}@ ${numberFormatter(getBid(item.itemHrid))}`);
					}
				})
			};

			profitList.push({
				name: action.name,
				skill: skill,
				profitPerHour: profitph,
				rate: (income / (teaCost + inputCost)).toFixed(2),
				income: income,
				cost: teaCost + inputCost,
				inputs: inputs,
				outputs: outputs,
				timeCost: timeCost,
			});
		};

		function caculateEnhancingAction(action) {
			const tea_ultra_enhancing = true, tea_super_enhancing = false, tea_enhancing = false, tea_blessed = true;
			const use_enchanted = true, enchanted_level = 10;
			const use_enhancer_top = false, enhancer_top_level = 0;
			const use_enhancer_bot = false, enhancer_bot_level = 0;
			const use_speed_necklace = true, speed_necklace_level = 3;

			let income = 0, inputCost = 0, teaCost = 0;
			let selectedSources = null;
			let profitph = 0;

			const teas = [
				{ teaName: "Ultra Enhancing Tea", teaUsage: tea_ultra_enhancing, defaultPrice: 20000 },
				{ teaName: "Super Enhancing Tea", teaUsage: tea_super_enhancing, defaultPrice: 10000 },
				{ teaName: "Enhancing Tea", teaUsage: tea_enhancing, defaultPrice: 2000 },
				{ teaName: "Blessed Tea", teaUsage: tea_blessed, defaultPrice: 2000 },
			];

			const observatory_level = getHouseLevelByActionHrid("/actions/enhancing/enhance");

			const enhancing_level = init_character_data.characterSkills.find(a => a.skillHrid === "/skills/enhancing").level;

			const effective_level = enhancing_level +
				(tea_ultra_enhancing ? 8 * (1 + drinkConcentration) :
					tea_super_enhancing ? 6 * (1 + drinkConcentration) :
						tea_enhancing ? 3 * (1 + drinkConcentration) : 0);

			const item_level = action.item.itemLevel;
			const enhancer_bonus = getToolSuccessBonus();

			let total_success_bonus = 0;
			if (effective_level >= item_level) {
				total_success_bonus = 1 + 0.05 * (effective_level - item_level + observatory_level) / 100 + enhancer_bonus;
			} else {
				total_success_bonus = 1 - (0.5 * (1 - effective_level / item_level)) + 0.05 * observatory_level / 100 + enhancer_bonus;
			}

			const tea_speed_bonus = tea_ultra_enhancing ? 0.06 * (1 + drinkConcentration) :
				tea_super_enhancing ? 0.04 * (1 + drinkConcentration) :
					tea_enhancing ? 0.02 * (1 + drinkConcentration) : 0;

			const calc_speed_bonus = (item_hrid, enhancementLevel) => {
				const item = Object.values(init_client_data.itemDetailMap).find(a => a.hrid === item_hrid);
				const type = item.equipmentDetail.type;
				const enhanceBonus = 1 + (getEnhancementBuffBonus(enhancementLevel) * (type.includes("earrings") || type.includes("ring") || type.includes("neck") ? 5 : 1));
				const speedBonus =
					(item.equipmentDetail?.noncombatStats?.enhancingSpeed ?? 0) * enhanceBonus +
					(item.equipmentDetail?.noncombatStats?.skillingSpeed ?? 0) * enhanceBonus;
				return speedBonus;
			};

			const item_speed_bonus = (use_enchanted ? calc_speed_bonus("/items/enchanted_gloves", enchanted_level) : 0) +
				(use_enhancer_top ? calc_speed_bonus("/items/enhancers_top", enhancer_top_level) : 0) +
				(use_enhancer_bot ? calc_speed_bonus("/items/enhancers_bottoms", enhancer_bot_level) : 0) +
				(use_speed_necklace ? calc_speed_bonus("/items/necklace_of_speed", speed_necklace_level) : 0);

			const speedBonus = observatory_level / 100 + item_speed_bonus + tea_speed_bonus;
			const levelDifferenceBonus = effective_level > item_level ? (effective_level - item_level + observatory_level) / 100 : 0;
			const actionTime = action.baseTimeCost / 1e9 / (1 + speedBonus + levelDifferenceBonus);

			let result;
			if (memo[`total_success_bonus=${total_success_bonus}&&itemLevel=${item_level}&&targetLevel=${action.targetLevel}&&protectLevel=${action.protectLevel}`]) {
				result = memo[`total_success_bonus=${total_success_bonus}&&itemLevel=${item_level}&&targetLevel=${action.targetLevel}&&protectLevel=${action.protectLevel}`];
			} else {
				result = enhancelate(action.targetLevel, action.protectLevel);
				memo[`total_success_bonus=${total_success_bonus}&&itemLevel=${item_level}&&targetLevel=${action.targetLevel}&&protectLevel=${action.protectLevel}`] = result;
			}
			const attempts = result.attempts;
			const protects = result.protects;

			let timeCost = actionTime * attempts;

			teas.forEach(tea => {
				if (tea.teaUsage) {
					const hrid = getItemHridFromName(tea.teaName);
					const askPrice = getAsk(hrid);
					const teaPrice = askPrice > 0 ? askPrice : tea.defaultPrice;

					teaCost += teaPrice / teaDuration * timeCost;
				}
			});

			const inputItems = [];
			for (const material of action.item.enhancementCosts) {
				inputItems.push({ itemHrid: material.itemHrid, count: material.count * attempts });
			}
			if (action.protectionItemHrid === action.itemHrid) {
				inputItems.push({ itemHrid: action.item.hrid, enhancementLevel: 0, count: 1 + protects });
			} else {
				inputItems.push({ itemHrid: action.item.hrid, enhancementLevel: 0, count: 1 });
				if (protects > 0) {
					inputItems.push({ itemHrid: action.protectionItemHrid, count: protects });
				}
			}
			const outputItems = [];
			outputItems.push({ itemHrid: action.item.hrid, enhancementLevel: action.targetLevel, count: 1 });

			income = 0;
			for (const item of outputItems) {
				if (!item.name) {
					item.name = init_client_data.itemDetailMap[item.itemHrid].name;
				}
				const bid = getBid(item.itemHrid, item.enhancementLevel ?? 0);
				const vendor = getVendor(item.itemHrid);
				income += Math.max(bid - Math.floor(0.02 * bid), vendor) * item.count;
			}

			for (const item of inputItems) {
				if (!item.name) {
					item.name = init_client_data.itemDetailMap[item.itemHrid].name;
				}
				if (!getItemSource(item)) {
					return;
				}
			}

			result = calculateBestItemSources(inputItems, income - teaCost, timeCost);
			if (!result) {
				console.log(action);
				return;
			}
			profitph = result.totalProfit / result.totalTimeCost * 3600;
			selectedSources = result.selectedSources;
			inputCost = result.totalCost;
			timeCost = result.totalTimeCost;

			if (outputItems.length === 1) {
				const item = outputItems[0];
				const name = item.name;
				const count = item.count;
				const itemHrid = item.itemHrid;
				const enhancementLevel = item.enhancementLevel || 0;

				if (name != "Coin") {
					itemSource[itemHrid][enhancementLevel] = itemSource[itemHrid][enhancementLevel] ?? []; // Initialize if undefined
					itemSource[itemHrid][enhancementLevel].push({ sourceName: action.name, cost: (teaCost + inputCost) / count, timeCost: timeCost / count })
				}
			}

			const inputs = [];
			if (inputItems) {
				inputItems.forEach(item => {
					const source = selectedSources.find(source => source.itemName === item.name).sourceName;
					if (source !== "market") {
						inputs.push([
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}` : ''}@ ${source}`,
							...profitList.find(action => action.name === source).inputs
						]);
					} else {
						inputs.push(
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}@ ${numberFormatter(getAsk(item.itemHrid, item.enhancementLevel))}` :
								`@ ${numberFormatter(getAsk(item.itemHrid))}`}`
						);
					}
				})
			};
			const outputs = [];
			if (outputItems) {
				outputItems.forEach(item => {
					if (item.count >= 0.01) {
						outputs.push(
							`${item.count.toFixed(2)}* ${item.name}${item.enhancementLevel ?
								`+${item.enhancementLevel}@ ${numberFormatter(getBid(item.itemHrid, item.enhancementLevel))}` :
								`@ ${numberFormatter(getBid(item.itemHrid))}`}`
						);
					} else {
						outputs.push(`${item.count.toFixed(6)}* ${item.name}@ ${numberFormatter(getBid(item.itemHrid))}`);
					}
				})
			};

			profitList.push({
				name: action.name,
				skill: "Enhancing",
				profitPerHour: profitph,
				rate: (income / (teaCost + inputCost)).toFixed(2),
				income: income,
				cost: teaCost + inputCost,
				inputs: inputs,
				outputs: outputs,
				timeCost: timeCost,
				attempts: attempts,
				protects: protects,
				actionTime: actionTime
			});

			function getToolSuccessBonus() {
				for (const item of init_character_data.characterItems) {
					if (item.itemLocationHrid === "/item_locations/enhancing_tool") {
						const enhanceBonus = 1 + getEnhancementBuffBonus(item.enhancementLevel);
						const buff = init_client_data.itemDetailMap[item.itemHrid].equipmentDetail.noncombatStats.enhancingSuccess || 0;
						return buff * enhanceBonus;
					}
				}
			}

			function enhancelate(targetLevel, protectLevel) {
				const success_rate = [
					50, 45, 45, 40, 40, 40, 35, 35, 35, 35,
					30, 30, 30, 30, 30, 30, 30, 30, 30, 30
				];

				const success_chances = success_rate.map(rate => Math.min(1, (rate / 100) * total_success_bonus));
				const markov = math.zeros(20, 20);

				for (let i = 0; i < targetLevel; i++) {
					let success_chance = success_chances[i];
					const fail_chance = 1 - success_chance;
					const destination = i >= protectLevel ? i - 1 : 0;

					if (tea_blessed) {
						const tea_bonus = success_chance * 0.01 * (1 + drinkConcentration);
						markov.set([i, i + 2], tea_bonus);
						success_chance -= tea_bonus;
					}

					markov.set([i, i + 1], success_chance);
					markov.set([i, destination], fail_chance);
				}

				markov.set([targetLevel, targetLevel], 1);

				const Q = markov.subset(math.index(
					math.range(0, targetLevel),
					math.range(0, targetLevel)
				));
				const M = math.inv(math.subtract(math.identity(targetLevel), Q));
				const attempts = math.sum(M.subset(math.index(0, math.range(0, targetLevel))));

				const protectAttempts = M.subset(math.index(math.range(0, 1), math.range(protectLevel, targetLevel)));
				const protectAttemptsArray = (typeof protectAttempts === 'number') ?
					[protectAttempts] :
					math.flatten(math.row(protectAttempts, 0).valueOf());
				const protects = protectAttemptsArray.map((a, i) => a * markov.get([i + protectLevel, i + protectLevel - 1])).reduce((a, b) => a + b, 0);


				return { attempts, protects };
			}
		}
	}

	function createActionList() {
		let milkingActionList = [];
		let foragingActionList = [];
		let woodcuttingActionList = [];
		let cheesesmithingActionList = [];
		let craftingActionList = [];
		let tailoringActionList = [];
		let cookingActionList = [];
		let brewingActionList = [];
		let alchemyActionList = [];
		let enhancingActionList = [];
		let addedActionList = [];

		// Categorize actions based on their type
		for (const action of Object.values(init_client_data.actionDetailMap)) {
			switch (action.type) {
				case "/action_types/milking": milkingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/foraging": foragingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/woodcutting": woodcuttingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/cheesesmithing": cheesesmithingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/crafting": craftingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/tailoring": tailoringActionList[action.sortIndex - 1] = action; break;
				case "/action_types/cooking": cookingActionList[action.sortIndex - 1] = action; break;
				case "/action_types/brewing": brewingActionList[action.sortIndex - 1] = action; break;
			}
		}

		for (const action of [...cheesesmithingActionList, ...craftingActionList, ...tailoringActionList]) {
			const upgradeItem = init_client_data.itemDetailMap[action.upgradeItemHrid];
			if (!action.upgradeItemHrid || !upgradeItem?.enhancementCosts) continue;

			if (action.outputItems.length === 1) {
				const outputItem = init_client_data.itemDetailMap[action.outputItems[0].itemHrid];
				if (outputItem?.enhancementCosts) {
					for (let i = 1; i <= 20; i++) {
						const copy = JSON.parse(JSON.stringify(action));
						copy.name = copy.name + " With +" + i + " Item";
						copy.upgradeItem = { name: getItemNameFromHrid(copy.upgradeItemHrid), itemHrid: copy.upgradeItemHrid, enhancementLevel: i, count: 1 };
						copy.outputItems[0].enhancementLevel = Math.floor(i * 0.7);
						addedActionList.push(copy);
					}
				}
			}
		}

		for (const item of Object.values(init_client_data.itemDetailMap)) {
			if (item.alchemyDetail) {
				function createAlchemyAction(item, hrid, category, nameSuffix, successRate, inputItems, outputItems) {
					return {
						hrid,
						successRate,
						baseTimeCost: 20000000000,
						type: "/action_types/alchemy",
						category,
						name: `${item.name} ${nameSuffix}`,
						levelRequirement: { skillHrid: "/skills/alchemy", level: item.itemLevel },
						inputItems,
						outputItems
					};
				}

				if (item.alchemyDetail.isCoinifiable) {
					const inputItems = [{ itemHrid: item.hrid, count: item.alchemyDetail.bulkMultiplier }];
					const outputItems = [{ itemHrid: "/items/coin", count: item.sellPrice * 5 * item.alchemyDetail.bulkMultiplier }];
					alchemyActionList.push(createAlchemyAction(item, "/actions/alchemy/coinify", "/action_types/alchemy/coinify", "(Coinify)", 0.7, inputItems, outputItems));
				}

				if (item.alchemyDetail.decomposeItems) {
					const baseMultiplier = item.alchemyDetail.bulkMultiplier;
					const coinCount = (10 + item.itemLevel) * 5 * baseMultiplier;

					// Create base decompose action
					const inputItems = [
						{ itemHrid: item.hrid, count: baseMultiplier },
						{ itemHrid: "/items/coin", count: coinCount }
					];
					const outputItems = item.alchemyDetail.decomposeItems.map(decomposeItem => ({
						itemHrid: decomposeItem.itemHrid,
						count: decomposeItem.count * baseMultiplier
					}));
					alchemyActionList.push(createAlchemyAction(item, "/actions/alchemy/decompose", "/action_types/alchemy/decompose", "(Decompose)", 0.6, inputItems, outputItems));

					// Create enhanced decompose actions
					if (item.enhancementCosts?.length) {
						function getAlchemyDecomposeEnhancingEssenceOutput(itemLevel, enhancementLevel) {
							return Math.round(2 * (.5 + .1 * Math.pow(1.05, itemLevel)) * Math.pow(2, enhancementLevel));
						}
						for (let enhancementLevel = 1; enhancementLevel <= 20; enhancementLevel++) {
							const enhancedInputItems = [
								{ itemHrid: item.hrid, count: baseMultiplier, enhancementLevel },
								{ itemHrid: "/items/coin", count: coinCount }
							];
							const enhancedOutputItems = [
								...outputItems,
								{
									itemHrid: "/items/enhancing_essence",
									count: getAlchemyDecomposeEnhancingEssenceOutput(item.itemLevel, enhancementLevel) * baseMultiplier
								}
							];
							alchemyActionList.push(createAlchemyAction(item, "/actions/alchemy/decompose", "/action_types/alchemy/decompose", `+${enhancementLevel} (Decompose)`, 0.6, enhancedInputItems, enhancedOutputItems));
						}
					}
				}

				if (item.alchemyDetail.transmuteSuccessRate && item.alchemyDetail.transmuteDropTable) {
					const inputItems = [
						{ itemHrid: item.hrid, count: item.alchemyDetail.bulkMultiplier },
						{ itemHrid: "/items/coin", count: Math.max(50, item.sellPrice / 5) * item.alchemyDetail.bulkMultiplier }
					];
					const outputItems = item.alchemyDetail.transmuteDropTable.map(transmuteDrop => ({
						itemHrid: transmuteDrop.itemHrid,
						count: transmuteDrop.dropRate * (transmuteDrop.minCount + transmuteDrop.maxCount) / 2 * item.alchemyDetail.bulkMultiplier
					}));
					alchemyActionList.push(createAlchemyAction(item, "/actions/alchemy/transmute", "/action_types/alchemy/transmute", "(Transmute)", item.alchemyDetail.transmuteSuccessRate, inputItems, outputItems));
				}
			}
			/*
			if (item.enhancementCosts) {
				function createEnhancingAction(item, targetLevel, protectLevel, protectionItemHrid = null) {
					return {
						hrid: "/actions/enhancing/enhance",
						baseTimeCost: 12000000000,
						type: "/action_types/enhancing",
						category: "/action_categories/enhancing/enhance",
						name: targetLevel === protectLevel ? `Enhance ${item.name} to +${targetLevel}` : `Enhance ${item.name} to +${targetLevel}, protect with ${getItemNameFromHrid(protectionItemHrid)} at +${protectLevel}`,
						item: item,
						targetLevel: targetLevel,
						protectLevel: protectLevel,
						protectionItemHrid: protectionItemHrid
					};
				}

				const length = item.protectionItemHrids?.length ?? 0;
				for (let targetLevel = 1; targetLevel <= 20; targetLevel++) {
					enhancingActionList.push(createEnhancingAction(item, targetLevel, targetLevel));
					if (targetLevel > 2) {
						for (let protectLevel = 2; protectLevel < targetLevel; protectLevel++) {
							for (let i = 0; i < length + 2; i++) {
								const protectionItemHrid = i < length ? item.protectionItemHrids[i] :
									i === length ? item.hrid : "/items/mirror_of_protection";
								enhancingActionList.push(createEnhancingAction(item, targetLevel, protectLevel, protectionItemHrid));
							}
						}
					}
				}
			}
				*/
		}

		let actionList = [
			...milkingActionList, ...foragingActionList, ...woodcuttingActionList,
			...cheesesmithingActionList, ...craftingActionList, ...tailoringActionList,
			...cookingActionList, ...brewingActionList, ...enhancingActionList, ...alchemyActionList,
			...addedActionList,
		];

		return actionList;
	}

	function getItemNameFromHrid(itemHrid) {
		return init_client_data.itemDetailMap[itemHrid]?.name || "Unknown Item";
	}

	function getItemHridFromName(name) {
		for (const item of Object.values(init_client_data.itemDetailMap)) {
			if (item.name === name) {
				return item.hrid;
			}
		}
	}

	function getAsk(itemHrid, enhanceLevel = 0) {
		if (itemHrid === '/items/white_key_fragment' || itemHrid === '/items/brown_key_fragment') {
			const prices = [
				price_data['/items/white_key_fragment'].asks[0],
				price_data['/items/brown_key_fragment'].asks[0]
			].filter(price => price >= 0); // Filter out negative values
			return prices.length > 0 ? Math.min(...prices) : -1; // Return -1 if no valid prices
		}
        return mwi.coreMarket.getItemPrice(itemHrid,enhanceLevel)?.ask||-1;
		return price_data[itemHrid].asks[enhanceLevel] || -1;
	}

	function getBid(itemHrid, enhanceLevel = 0) {
		if (itemHrid === '/items/white_key_fragment' || itemHrid === '/items/brown_key_fragment') {
			return Math.max(price_data['/items/white_key_fragment'].bids[0] || -1, price_data['/items/brown_key_fragment'].bids[0] || -1);
		}
        return mwi.coreMarket.getItemPrice(itemHrid,enhanceLevel)?.bid||-1;
		return price_data[itemHrid].bids[enhanceLevel] || -1;
	}

	function getVendor(itemHrid) {
		return price_data[itemHrid].vendor;
	}

	function getValue(itemHrid, enhanceLevel = 0) {
		let ask = getAsk(itemHrid, enhanceLevel);
		let bid = getBid(itemHrid, enhanceLevel);
		const vendor = getVendor(itemHrid);
		bid = Math.max(bid, vendor);
		ask = Math.max(ask, bid);
		return [ask, bid, vendor];
	}

	function initiatePriceData() {
		if (!init_client_data) return;
		if (!price_data) { price_data = {} };
		const itemDetailMap = init_client_data.itemDetailMap;
		for (const itemHrid of Object.keys(itemDetailMap)) {
			if (!price_data[itemHrid]) {
				price_data[itemHrid] =
				{
					asks: [-1],
					bids: [-1],
					vendor: itemDetailMap[itemHrid].sellPrice || 0,
					time: -1
				}
			}
		}
	}

	function calculateSpecialPrices() {
		price_data["/items/coin"].asks[0] = 1;
		price_data["/items/coin"].bids[0] = 1;
		price_data["/items/coin"].vendor = 1;

		price_data["/items/cowbell"].asks[0] = getAsk("/items/bag_of_10_cowbells") / 10;
		price_data["/items/cowbell"].bids[0] = getBid("/items/bag_of_10_cowbells") / 10;

		calculateChestPrice("/items/small_artisans_crate");
		calculateChestPrice("/items/small_meteorite_cache");
		calculateChestPrice("/items/small_treasure_chest");

		calculateChestPrice("/items/medium_artisans_crate");
		calculateChestPrice("/items/medium_meteorite_cache");
		calculateChestPrice("/items/medium_treasure_chest");

		calculateChestPrice("/items/large_artisans_crate");
		calculateChestPrice("/items/large_meteorite_cache");
		calculateChestPrice("/items/large_treasure_chest");

		price_data["/items/task_token"].asks[0] = Math.max(getAsk("/items/large_artisans_crate"), getAsk("/items/large_meteorite_cache"), getAsk("/items/large_treasure_chest")) / 30;
		price_data["/items/task_token"].bids[0] = Math.max(getBid("/items/large_artisans_crate"), getBid("/items/large_meteorite_cache"), getBid("/items/large_treasure_chest")) / 30;

		price_data["/items/task_crystal"].asks[0] = getAsk("/items/task_token") * 50;
		price_data["/items/task_crystal"].bids[0] = getBid("/items/task_token") * 50;

		calculateChestPrice("/items/purples_gift");

		price_data["/items/chimerical_quiver"].asks[0] = getAsk("/items/mirror_of_protection");
		price_data["/items/chimerical_quiver"].bids[0] = getBid("/items/mirror_of_protection");

		price_data["/items/sinister_cape"].asks[0] = getAsk("/items/mirror_of_protection");
		price_data["/items/sinister_cape"].bids[0] = getBid("/items/mirror_of_protection");

		price_data["/items/enchanted_cloak"].asks[0] = getAsk("/items/mirror_of_protection");
		price_data["/items/enchanted_cloak"].bids[0] = getBid("/items/mirror_of_protection");

		calculateTokenPrice("/items/chimerical_token");
		calculateTokenPrice("/items/sinister_token");
		calculateTokenPrice("/items/enchanted_token");
		calculateTokenPrice("/items/pirate_token");

		calculateChestPrice("/items/chimerical_chest");
		calculateChestPrice("/items/sinister_chest");
		calculateChestPrice("/items/enchanted_chest");
		calculateChestPrice("/items/pirate_chest");

		console.log(price_data);
	}

	function calculateChestPrice(itemHrid) {
		const openableLootDropMap = init_client_data.openableLootDropMap;
		if (!openableLootDropMap[itemHrid]) {
			return -1;
		}
		let askPrice = 0, bidPrice = 0;
		let selfCount = 1;
		for (const drop of openableLootDropMap[itemHrid]) {
			const expectedCount = drop.dropRate * (drop.minCount + drop.maxCount) / 2;
			if (drop.itemHrid === itemHrid) {
				selfCount -= expectedCount;
				continue;
			} else {
				askPrice += expectedCount * getValue(drop.itemHrid)[0];
				bidPrice += expectedCount * getValue(drop.itemHrid)[1];
			}
		}
		if (selfCount !== 0) {
			price_data[itemHrid].asks[0] = askPrice / selfCount;
			price_data[itemHrid].bids[0] = bidPrice / selfCount;
		} else {
			price_data[itemHrid].asks[0] = 0;
			price_data[itemHrid].bids[0] = 0;
		}
	}

	function calculateTokenPrice(itemHrid) {
		const shopItemDetailMap = init_client_data.shopItemDetailMap;
		const itemList = [];
		for (const item of Object.values(shopItemDetailMap)) {
			if (item.costs.length === 1 && item.costs[0].itemHrid === itemHrid) {
				itemList.push({ itemHrid: item.itemHrid, count: item.costs[0].count })
			}
		}
		price_data[itemHrid].asks[0] = itemList.reduce((accumulator, currentValue) => Math.max(accumulator, getAsk(currentValue.itemHrid) / currentValue.count), 0);
		price_data[itemHrid].bids[0] = itemList.reduce((accumulator, currentValue) => Math.max(accumulator, getBid(currentValue.itemHrid) / currentValue.count), 0);
	}

})();