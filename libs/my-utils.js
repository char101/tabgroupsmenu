function copyattr(el1, el2, attr) {
    if (el2.hasAttribute(attr)) {
        el1.setAttribute(attr, el2.getAttribute(attr));
    }
}

// Remove element
function remove(el) {
    el.parentNode.removeChild(el);
}

// vim: set ts=4 sw=4 sts=4 et:
