/**
 * auth-nav.js
 * Upgrades static "Sign In" nav links into an account chip that shows the
 * signed-in user's avatar, name and role badge (Guest / Host / Admin), and
 * routes them to the correct dashboard. Safe no-op when logged out.
 */
(function () {
  'use strict';

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem('lala_user') || 'null');
    } catch (e) {
      return null;
    }
  }

  function isSignedIn() {
    return !!localStorage.getItem('lala_token') && !!getUser();
  }

  var ROLE_META = {
    guest: { label: 'Guest Account', dash: 'my-bookings.html', icon: 'ti-user' },
    host: { label: 'Host Account', dash: 'host-dashboard.html', icon: 'ti-building-estate' },
    admin: { label: 'Admin Account', dash: 'admin-portal.html', icon: 'ti-shield' }
  };

  function roleMeta(user) {
    return ROLE_META[user.role] || ROLE_META.guest;
  }

  function initials(user) {
    var n = (user.name || user.email || 'U').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/);
    var ch = n.map(function (w) { return w.charAt(0); }).join('').toUpperCase().slice(0, 2);
    return ch || 'U';
  }

  function signOut() {
    localStorage.removeItem('lala_token');
    localStorage.removeItem('lala_user');
    localStorage.removeItem('lala_last_activity');
    window.location.href = 'index.html';
  }

  function chipHTML(user) {
    var meta = roleMeta(user);
    var avatar = user.avatar
      ? '<img src="' + user.avatar + '" alt="" class="account-avatar-img">'
      : '<span class="account-avatar-txt">' + initials(user) + '</span>';
    return (
      '<div class="account-chip" data-role="' + (user.role || 'guest') + '">' +
        '<a href="notifications.html" class="account-bell" title="Notifications" aria-label="Notifications">' +
          '<i class="ti ti-bell"></i>' +
          '<span class="account-bell-badge" id="acctBellBadge" style="display:none;">0</span>' +
        '</a>' +
        '<a href="' + meta.dash + '" class="account-chip-link" title="Go to ' + meta.label + '">' +
          '<span class="account-avatar">' + avatar + '</span>' +
          '<span class="account-meta">' +
            '<span class="account-name">' + (user.name || 'My Account') + '</span>' +
            '<span class="account-badge">' + meta.label + '</span>' +
          '</span>' +
        '</a>' +
        '<button type="button" class="account-signout" title="Sign out" onclick="window.authNavSignOut && authNavSignOut()">' +
          '<i class="ti ti-logout"></i>' +
        '</button>' +
      '</div>'
    );
  }

  function refreshBellBadge() {
    if (!isSignedIn()) return;
    var badge = document.getElementById('acctBellBadge');
    if (!badge) return;
    fetch((window.API_URL || 'http://localhost:5000/api') + '/notifications/unread-count', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('lala_token') }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var count = data && typeof data.count === 'number' ? data.count : 0;
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? '' : 'none';
      })
      .catch(function () { badge.style.display = 'none'; });
  }

  function upgrade() {
    if (!isSignedIn()) return;
    var user = getUser();
    var chip = chipHTML(user);
    var links = document.querySelectorAll('.nav-links a[href="guest-login.html"], .mobile-menu a[href="guest-login.html"]');
    links.forEach(function (a) {
      a.outerHTML = chip;
    });
    // Bottom nav "Profile" stays an icon link but routes to the role dashboard.
    var profile = document.querySelectorAll('.bottom-nav a[href="guest-login.html"]');
    profile.forEach(function (a) {
      a.setAttribute('href', roleMeta(user).dash);
      a.setAttribute('title', roleMeta(user).label);
    });
    refreshBellBadge();
    setInterval(refreshBellBadge, 60000);
  }

  window.authNavSignOut = signOut;
  window.authNavUpgrade = upgrade;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgrade);
  } else {
    upgrade();
  }
})();
