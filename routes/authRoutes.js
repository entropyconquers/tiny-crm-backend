require('dotenv').config();
const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get("/failed", (req, res) => {
    res.status(401).json({message: "Authentication failed"});
});

router.get('/auth/google',
    passport.authenticate('google', {
            scope: ['email', 'profile']
        }
    ));

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/failed' }),
    function (req, res) {
        res.redirect(302, process.env.FRONTEND_URL + '/dashboard');
    }
);

//Logout
router.get('/api/logout', (req, res) => {
    req.logout();
    res.json({message: "User logged out"});
});

module.exports = router;