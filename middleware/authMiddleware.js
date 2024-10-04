function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('message', 'Please log in to access this page.');
    req.flash('messageType', 'error');
    res.redirect('/login');
}

module.exports = ensureAuthenticated