//
// Copyright 2019 Perforce Software
//
const fs = require('fs')
const express = require('express')
const router = express.Router()
const passport = require('passport')
const SamlStrategy = require('passport-saml').Strategy
const transitory = require('transitory')

// Set up an in-memory cache of the user details; could have used
// github:isaacs/node-lru-cache but that lacks fine cache control, while
// github:aholstenson/transitory is a bit more sophisticated.
const userCache = transitory()
  .expireAfterWrite(60 * 60 * 1000)
  .expireAfterRead(5 * 60 * 1000)
  .build()
// Nonetheless, still need to prune stale entries occasionally.
setInterval(() => userCache.cleanUp(), 5 * 60 * 1000)

let strategy = new SamlStrategy({
  callbackUrl: process.env.SAML_SP_SSO_URL || 'http://localhost:3000/saml/sso',
  logoutCallbackUrl: process.env.SAML_SP_SLO_URL || 'http://localhost:3000/saml/slo',
  entryPoint: process.env.SAML_IDP_SSO_URL || 'http://localhost:7000/saml/sso',
  logoutUrl: process.env.SAML_IDP_SLO_URL || 'http://localhost:7000/saml/slo',
  issuer: process.env.SAML_SP_ISSUER || 'urn:example:sp',
  audience: process.env.SP_AUDIENCE || undefined,
  privateCert: process.env.SP_KEY_FILE ? fs.readFileSync(process.env.SP_KEY_FILE) : undefined,
  signatureAlgorithm: process.env.SP_KEY_ALGO || 'sha256'
},
(profile, done) => {
  // profile: {
  //   issuer: {...},
  //   sessionIndex: '_1189d45be2aed1519794',
  //   nameID: 'jackson@example.com',
  //   nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  //   nameQualifier: undefined,
  //   spNameQualifier: undefined,
  //   fullname: 'Sam L. Jackson',
  //   getAssertionXml: [Function]
  // }
  //
  // produce a "user" object that contains the information that passport-saml
  // requires for logging out via SAML
  //
  return done(null, {
    nameID: profile.nameID,
    nameIDFormat: profile.nameIDFormat,
    sessionIndex: profile.sessionIndex
  })
})
passport.use(strategy)
router.use(passport.initialize())
router.use(passport.session())

passport.serializeUser((user, done) => {
  // serialize the entire object as-is
  done(null, user)
})

passport.deserializeUser((user, done) => {
  done(null, user)
})

router.get('/metadata', (req, res) => {
  let xml = strategy.generateServiceProviderMetadata()
  res.header('Content-Type', 'text/xml').send(xml)
})

router.get('/login', passport.authenticate('saml', {
  successReturnToOrRedirect: '/',
  failureRedirect: '/saml/login_failed',
  failureFlash: true
}))

router.post('/sso', passport.authenticate('saml', {
  successReturnToOrRedirect: '/saml/details',
  failureRedirect: '/saml/login_failed',
  failureFlash: true
}))

router.get('/login_failed', (req, res, next) => {
  // we need a route that is not the login route lest we end up
  // in a redirect loop when a failure occurs
  res.render('login_failed')
})

function checkAuthentication (req, res, next) {
  if (req.isAuthenticated()) {
    next()
  } else {
    res.redirect('/')
  }
}

router.get('/details', checkAuthentication, (req, res, next) => {
  // using nameID for the cache key because it is the best we have right now
  userCache.set(req.user.nameID, req.user)
  const name = req.user.nameID
  res.render('details', { name })
})

router.get('/data/:id', (req, res, next) => {
  // the params are automatically decoded
  let user = userCache.get(req.params.id)
  if (user) {
    // The SAML idp may not provide email, which the extension is expecting, so
    // repurpose the nameID as the email, since that should be correct.
    res.json(Object.assign({}, user, {
      email: user.nameID
    }))
  } else {
    next()
  }
})

router.get('/logout', (req, res) => {
  userCache.delete(req.user.nameID)
}, passport.authenticate('saml', {
  successReturnToOrRedirect: '/',
  samlFallback: 'logout-request'
}))

router.post('/slo', passport.authenticate('saml', {
  successReturnToOrRedirect: '/',
  samlFallback: 'logout-request'
}))

module.exports = router