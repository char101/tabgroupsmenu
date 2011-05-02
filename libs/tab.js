let tabutil = {
	getTitle: function tabutil_getTitle(tab) {
		return tab.getAttribute('label');
	},
	getTabGroupItem: function tabutil_getTabGroupItem(tab) {
		let tabItem = tab._tabViewTabItem;
		if (tabItem) {
			return tabItem.parent;
		}
	}
}
