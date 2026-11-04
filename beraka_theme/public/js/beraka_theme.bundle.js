/* Beraka Soft desk shell for Frappe v16.
 * - Hides the icon-only dock rail and lists every module (ERPNext, HR, Insights...) in one sidebar.
 * - The module on screen expands to show its own links underneath, like a classic ERP menu.
 * - Adds a top bar with the logo, search, notifications, settings and logout.
 */
(function () {
	if (!window.frappe || !frappe.ui || !frappe.ui.Sidebar) return;

	const P = frappe.ui.Sidebar.prototype;
	const orig_setup = P.setup;

	// No rail: the sidebar is always a full-width panel.
	P.dock_enabled = () => false;
	P.saved_collapsed_state = () => false;

	// --- module list -------------------------------------------------------
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
			out.push({
				link_type: "Sidebar",
				link_to: name,
				module: name,
				label: sb.label || name,
				icon: frappe.get_module_icon(name),
			});
		});
		return out;
	}

	function icon_html(icon) {
		if (!icon) return '<span class="bk-dot"></span>';
		if (typeof icon === "string" && icon.trim().startsWith("<")) return icon;
		try {
			return frappe.utils.icon(icon, "sm", "", "", "current-color", true);
		} catch (e) {
			return '<span class="bk-dot"></span>';
		}
	}

	P.setup = function (current_module) {
		orig_setup.call(this, current_module);
		render_modules(this);
	};

	function render_modules(sidebar) {
		const $items = sidebar.$sidebar; // .sidebar-items
		if (!$items || !$items.length) return;

		// Native items of the current module, to be nested under its row.
		const $native = $items.children().not(".bk-modules");
		$items.find(".bk-modules").remove();

		const $list = $('<div class="bk-modules"><div class="bk-modules-title">' + __("Modules") + "</div></div>");
		module_entries(sidebar).forEach((entry) => {
			const active = entry.module && entry.module === sidebar.current_module;
			const caret = entry.module
				? '<span class="bk-module-caret">' + frappe.utils.icon("chevron-down", "xs", "", "", "current-color", true) + "</span>"
				: "";
			const $row = $(
				'<div class="bk-module ' + (active ? "active" : "") + '">' +
					'<a class="bk-module-anchor" href="#">' +
						'<span class="bk-module-icon">' + icon_html(entry.icon) + "</span>" +
						'<span class="bk-module-label">' + frappe.utils.escape_html(entry.label || "") + "</span>" +
						caret +
					"</a>" +
				"</div>"
			);
			$row.find(".bk-module-anchor").on("click", (e) => {
				e.preventDefault();
				if (active) {
					$row.toggleClass("collapsed");
					return;
				}
				sidebar.open_dock_entry(entry);
			});
			if (active) {
				const $sub = $('<div class="bk-module-items"></div>');
				$sub.append($native);
				$row.append($sub);
			}
			$list.append($row);
		});
		$items.prepend($list);
		sidebar.highlight_active_item();
	}

	// --- top bar -------------------------------------------------------------
	function click_sidebar_item(selector) {
		const $t = $(".standard-items-band").find(selector).first();
		if ($t.length) {
			$t.trigger("click");
			return true;
		}
		return false;
	}

	function make_topbar() {
		if ($(".bk-topbar").length) return;
		const logo = frappe.boot.app_logo_url || "/assets/frappe/images/frappe-framework-logo.svg";
		const ic = (n) => frappe.utils.icon(n, "sm", "", "", "current-color", true);
		const $bar = $(
			'<div class="bk-topbar">' +
				'<a class="bk-topbar-brand" href="/desk"><img src="' + logo + '" alt="Beraka Soft"></a>' +
				'<button class="bk-topbar-search" type="button">' + ic("search") + "<span>" + __("Search") + "</span><kbd>Ctrl K</kbd></button>" +
				'<div class="bk-topbar-actions">' +
					'<button class="bk-topbar-btn bk-notify" type="button" title="' + __("Notifications") + '">' + ic("notification") + "</button>" +
					'<button class="bk-topbar-btn bk-settings" type="button" title="' + __("Settings") + '">' + ic("setting-gear") + "</button>" +
					'<button class="bk-topbar-btn bk-logout" type="button" title="' + __("Logout") + '">' + ic("log-out") + "<span>" + __("Logout") + "</span></button>" +
					'<span class="bk-topbar-avatar">' + frappe.avatar(frappe.session.user, "avatar-small") + "</span>" +
				"</div>" +
			"</div>"
		);
		$bar.find(".bk-topbar-search").on("click", () => {
			if (!click_sidebar_item(".navbar-modal-search-mobile, [item-name='Search'] .item-anchor, .sidebar-search")) {
				$(document).trigger($.Event("keydown", { key: "k", ctrlKey: true, which: 75, keyCode: 75 }));
			}
		});
		$bar.find(".bk-notify").on("click", () =>
			click_sidebar_item(".sidebar-notification, [item-name='Notifications'] .item-anchor")
		);
		$bar.find(".bk-settings").on("click", () =>
			frappe.require("user_settings_dialog.bundle.js").then(() => frappe.ui.show_user_settings("profile"))
		);
		$bar.find(".bk-logout").on("click", () => frappe.app.logout());
		$("body").addClass("bk-shell").prepend($bar);
	}

	$(document).on("sidebar_setup", make_topbar);
	$(document).ready(() => setTimeout(make_topbar, 1500));
})();
