function ensureAdmin(req, res, next) {
    if (req.session.user && req.session.user.isAdmin) {
        return next();
    }
    req.flash('message', 'Access denied. Admin privileges required.');
    req.flash('messageType', 'error');
    res.redirect('/hub');
}
module.exports = ensureAdmin;