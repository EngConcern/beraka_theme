/* Beraka Soft desk shell for Frappe v16.
 * - Hides the icon-only dock rail and lists every module (ERPNext, HR, Insights...) in one sidebar.
 * - Every module expands in place to show its own links, read straight from boot data.
 * - Daily-use modules first, configuration and build modules last.
 * - Top bar with logo, Home, search, notifications, settings and logout.
 * - /desk lands on the Overview workspace instead of the app picker.
 */
(function () {
	if (!window.frappe || !frappe.ui || !frappe.ui.Sidebar) return;

	const LANDING = "overview"; // workspace slug created by seed_04_home_workspace.py
	const TOP_ORDER = [
		"Home", "Overview", "Accounts", "Accounting", "Selling", "Buying", "Stock", "Payroll", "HR", "HR Setup",
		"Shift & Attendance", "Leaves", "Expenses", "Recruitment", "Performance", "Employee Lifecycle",
		"CRM", "Support", "Projects", "Manufacturing", "Assets", "Quality", "Subcontracting",
		"Insights", "Print Designer", "Tax & Benefits",
	];
	const BOTTOM_ORDER = [
		"Contacts", "Geo", "Automation", "Workflow", "Printing", "Email", "Website", "Data",
		"Integrations", "System", "Users", "Setup", "Build",
	];

	const P = frappe.ui.Sidebar.prototype;
	const orig_setup = P.setup;

	// No rail: the sidebar is always a full-width panel.
	P.dock_enabled = () => false;
	P.saved_collapsed_state = () => false;

	// ---------------------------------------------------------------- data
	function rank(label) {
		const t = TOP_ORDER.indexOf(label);
		if (t >= 0) return t;
		const b = BOTTOM_ORDER.indexOf(label);
		if (b >= 0) return 1000 + b;
		return 500;
	}

	function module_entries(sidebar) {
		const seen = new Set();
		const out = [];
		(frappe.boot.app_data || []).forEach((app) => {
			sidebar.collect_dock_entries(app).forEach((e) => {
				const key = e.module || e.url || e.link_to;
				if (!key || seen.has(key)) return;
				seen.add(key);
				out.push(e);
			});
		});
		Object.entries(frappe.boot.module_sidebars || {}).forEach(([name, sb]) => {
			if (name === frappe.ui.PRIVATE_SHELL || seen.has(name)) return;
			seen.add(name);
			out.push({ link_type: "Sidebar", link_to: name, module: name, label: sb.label || name, icon: frappe.get_module_icon(name) });
		});
		out.forEach((e, i) => (e._i = i));
		out.sort((a, b) => rank(a.label) - rank(b.label) || a._i - b._i);
		return out;
	}

	function icon_html(icon, size) {
		if (!icon) return '<span class="bk-dot"></span>';
		if (typeof icon === "string" && icon.trim().startsWith("<")) return icon;
		try {
			return frappe.utils.icon(icon, size || "sm", "", "", "current-color", true);
		} catch (e) {
			return '<span class="bk-dot"></span>';
		}
	}

	function item_path(item, module) {
		try {
			return frappe.ui.sidebar_item.get_route(item, false, module) || null;
		} catch (e) {
			return null;
		}
	}

	// ---------------------------------------------------------------- expanded state
	const STORE = "bk-open-modules";
	function open_set() {
		try {
			return new Set(JSON.parse(localStorage.getItem(STORE) || "[]"));
		} catch (e) {
			return new Set();
		}
	}
	function save_open(set) {
		try {
			localStorage.setItem(STORE, JSON.stringify([...set]));
		} catch (e) {
			/* private window */
		}
	}

	// ---------------------------------------------------------------- render
	P.setup = function (current_module) {
		orig_setup.call(this, current_module);
		render_modules(this);
	};

	function render_modules(sidebar) {
		const $items = sidebar.$sidebar; // .sidebar-items
		if (!$items || !$items.length) return;
		$items.find(".bk-modules").remove();

		const open = open_set();
		if (sidebar.current_module) open.add(sidebar.current_module);

		const $list = $('<div class="bk-modules"></div>');
		module_entries(sidebar).forEach((entry) => {
			const module = entry.module;
			const data = module ? frappe.boot.module_sidebars[module] : null;
			const items = (data && data.items) || [];
			const is_open = module && open.has(module);
			const $row = $(
				'<div class="bk-module' + (module === sidebar.current_module ? " active" : "") + (is_open ? " open" : "") + '">' +
					'<a class="bk-module-anchor" href="#">' +
						'<span class="bk-module-icon">' + icon_html(entry.icon) + "</span>" +
						'<span class="bk-module-label">' + frappe.utils.escape_html(entry.label || "") + "</span>" +
						(items.length ? '<span class="bk-module-caret">' + icon_html("chevron-down", "xs") + "</span>" : "") +
					"</a>" +
				"</div>"
			);

			if (items.length) {
				const $sub = $('<div class="bk-module-items"></div>');
				items.forEach((item) => {
					if (item.type === "Section Break") {
						if (item.label && !item.indent) $sub.append('<div class="bk-group">' + frappe.utils.escape_html(item.label) + "</div>");
						return;
					}
					if (item.type !== "Link") return;
					// Frappe caps a computed module menu at 15 doctypes and appends an "N more not shown"
					// row that opens the DocType list. Not useful to an end user, so it is dropped.
					if (item.link_type === "DocType" && item.link_to === "DocType" && item.filters) return;
					const path = item_path(item, module);
					if (!path) return;
					const $a = $(
						'<a class="bk-link' + (item.indent ? " indent" : "") + '" href="' + frappe.utils.escape_html(path) + '" data-link-type="' + (item.link_type || "") + '">' +
							(item.icon ? '<span class="bk-link-icon">' + icon_html(item.icon, "xs") + "</span>" : "") +
							'<span class="bk-link-label">' + frappe.utils.escape_html(item.label || item.link_to) + "</span>" +
						"</a>"
					);
					$a.on("click", (e) => {
						if (item.link_type === "URL") return; // let the browser open it
						e.preventDefault();
						sidebar.select_shell(module);
						frappe.set_route(path);
					});
					$sub.append($a);
				});
				$row.append($sub);

				$row.find(".bk-module-anchor").on("click", (e) => {
					e.preventDefault();
					$row.toggleClass("open");
					const set = open_set();
					$row.hasClass("open") ? set.add(module) : set.delete(module);
					save_open(set);
				});
			} else {
				$row.find(".bk-module-anchor").on("click", (e) => {
					e.preventDefault();
					sidebar.open_dock_entry(entry);
				});
			}
			$list.append($row);
		});
		$items.prepend($list);
		highlight();
	}

	function highlight() {
		const path = decodeURIComponent(window.location.pathname).replace(/\/$/, "");
		let best = null, best_len = 0;
		$(".bk-link[href]").removeClass("active").each(function () {
			const href = decodeURIComponent(this.getAttribute("href").split("?")[0]).replace(/\/$/, "");
			if (!href) return;
			const hit = path === href || (this.dataset.linkType !== "Workspace" && path.startsWith(href + "/"));
			if (hit && href.length > best_len) { best = this; best_len = href.length; }
		});
		if (best) {
			$(best).addClass("active");
			const $m = $(best).closest(".bk-module");
			$(".bk-module").removeClass("active");
			$m.addClass("active open");
			if (!frappe.dom.is_element_in_viewport(best)) best.scrollIntoView({ block: "center" });
		}
	}

	// ---------------------------------------------------------------- landing + top bar
	function go_home() {
		const s = frappe.app && frappe.app.sidebar;
		if (frappe.workspaces && frappe.workspaces[LANDING]) {
			frappe.set_route(LANDING);
		} else if (s && s.open_workspace) {
			s.open_workspace("Home");
		} else {
			frappe.set_route("home");
		}
	}

	function land_if_app_picker() {
		if (!frappe.get_route().length && /\/desk\/?$/.test(window.location.pathname)) {
			frappe.route_flags.replace_route = true;
			go_home();
		}
	}

	function click_sidebar_item(selector) {
		const $t = $(".standard-items-band").find(selector).first();
		if ($t.length) { $t.trigger("click"); return true; }
		return false;
	}

	function make_topbar() {
		if ($(".bk-topbar").length) return;
		const logo = frappe.boot.app_logo_url || "/assets/frappe/images/frappe-framework-logo.svg";
		const ic = (n) => icon_html(n, "sm");
		const $bar = $(
			'<div class="bk-topbar">' +
				'<a class="bk-topbar-brand" href="/desk"><img src="' + logo + '" alt="Beraka Soft" style="height:30px;width:auto"></a>' +
				'<button class="bk-topbar-btn bk-home" type="button">' + ic("home") + "<span>" + __("Home") + "</span></button>" +
				'<button class="bk-topbar-search" type="button">' + ic("search") + "<span>" + __("Search") + "</span><kbd>Ctrl K</kbd></button>" +
				'<div class="bk-topbar-actions">' +
					'<button class="bk-topbar-btn bk-notify" type="button" title="' + __("Notifications") + '">' + ic("notification") + "</button>" +
					'<button class="bk-topbar-btn bk-settings" type="button" title="' + __("Settings") + '">' + ic("setting-gear") + "</button>" +
					'<button class="bk-topbar-btn bk-logout" type="button" title="' + __("Logout") + '">' + ic("log-out") + "<span>" + __("Logout") + "</span></button>" +
					'<span class="bk-topbar-avatar">' + frappe.avatar(frappe.session.user, "avatar-small") + "</span>" +
				"</div>" +
			"</div>"
		);
		$bar.find(".bk-topbar-brand, .bk-home").on("click", (e) => { e.preventDefault(); go_home(); });
		$bar.find(".bk-topbar-search").on("click", () => {
			if (!click_sidebar_item(".navbar-modal-search-mobile, [item-name='Search'] .item-anchor")) {
				$(document).trigger($.Event("keydown", { key: "k", ctrlKey: true, which: 75, keyCode: 75 }));
			}
		});
		$bar.find(".bk-notify").on("click", () => click_sidebar_item(".sidebar-notification, [item-name='Notification'] .item-anchor"));
		$bar.find(".bk-settings").on("click", () =>
			frappe.require("user_settings_dialog.bundle.js").then(() => frappe.ui.show_user_settings("profile"))
		);
		$bar.find(".bk-logout").on("click", () => frappe.app.logout());
		$("body").addClass("bk-shell").prepend($bar);
	}

	$(document).on("sidebar_setup", make_topbar);
	$(document).ready(() => {
		setTimeout(make_topbar, 1500);
		setTimeout(land_if_app_picker, 300);
		if (frappe.router && frappe.router.on) {
			frappe.router.on("change", () => {
				land_if_app_picker();
				setTimeout(highlight, 50);
			});
		}
	});
})();
