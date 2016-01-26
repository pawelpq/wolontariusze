'use strict'

/**
 * Module dependencies.
 */
var express = require('express')
var passport = require('passport')
var util = require('util')
var bodyParser = require('body-parser')
var expressSession = require('express-session')

var env = process.env.NODE_ENV || 'development'
var config = require('./config.json')[env]
var oauth2 = require('./oauth/oauth2')

var Volunteers = require('./app/services/'+config.service+'/volonteers')
var Activities = require('./app/services/'+config.service+'/activities')
var Joints = require('./app/services/'+config.service+'/joints')

// Express configuration

var session = [expressSession({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false
}), passport.initialize(), passport.session()]

// Format każdego poprawnie wykonanego zapytania
var success = function(data) {
  return {
    status: 'success',
    data: data
  }
}

// Format każdego niepoprawnie wykonanego zapytania
var error = function(type, message) {
  var result = {
    status: 'error',
    type: type
  }
  if(message && Object.keys({}).length) {
      result.message = message
  }
  return result
}

var server = module.exports = express();

server.set('view engine', 'ejs');
server.set('views', process.cwd() + '/oauth/views')
//server.use(express.logger());
//server.use(express.cookieParser());
server.use(bodyParser.json())
server.use(bodyParser.urlencoded({ extended: true }))
/*
server.use(function(req, res, next) {
  console.log('-- session --');
  console.dir(req.session);
  //console.log(util.inspect(req.session, true, 3));
  console.log('-------------');
  next()
});
*/
//server.use(server.router);
//server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

// Passport configuration

require('./auth');
require('./oauth/auth');

// Formularz do logowania dla wolontariuszy chcących dać dostęp do swojego
// konta wybranej aplikacji.
server.get('/api/v2/login', session, function(req, res) { res.render('login') })
server.post('/api/v2/login', session, passport.authenticate('local', {
  successReturnToOrRedirect: '/api/v2/',
  failureRedirect: '/api/v2/login'
}))

server.get('/api/v2/logout', session, function(req, res) {
  req.logout()
  res.redirect('/api/v2/')
})

// Okienko w którym wolontariusz wyraża zgodę (lub nie) na dostęp do swojego
// konta.
server.get('/api/v2/dialog/authorize', session, oauth2.authorization);
server.post('/api/v2/dialog/authorize/decision', session, oauth2.decision);

// Końcówka dla klienta oauth chcącego zamienić tymczasowy kod dostępu na
// token.
server.post('/api/v2/oauth/token', passport.initialize(), oauth2.token);

// Autoryzacja tokenem oAuth
var bearer = [passport.initialize(), function(req, res, next) {
  passport.authenticate('bearer', { session: false }, function(err, user, info) {
    // Wystąpił błąd
    if (err) {
      return next(err) // status: 500
    }
    // Niezalogowany
    if (!user) {
      return res.status(401).send(error('Unauthorized'))
    }
    // Zaloguj
    req.logIn(user, function(err) {
      next() // Kontynuuj
    })
  })(req, res, next)
}]

// Wiadomość powitalna
server.get('/api/v2/', bearer, function(req, res) {
  res.send(success())
})

server.get('/api/v2/client', bearer, function(req, res) {
  res.json(success({
    client_id: req.user.id
  }))
})

// Dodawanie wolontariuszy
server.post('/api/v2/volunteers/', bearer, function(req, res) {
  // Sprawdź wymagane uprawnienia administratora
  if(!req.user || !req.user.is_admin) {
    return res.status(403).send(error('AdminRequired'))
  }

  Volunteers.create(req, 'Volunteers', {}, req.body, {}, function (err, volunteer) {
    if(err) { res.send(500) }
    else { res.status(201).send(success({volunteer: volunteer})) }
  })
})

// Lista wolontariuszy
server.get('/api/v2/volunteers', bearer, function(req, res) {
  Volunteers.read(req, 'Volunteers', {}, req.query, function (err, volunteers) {
    res.send(success({volunteers: volunteers}))
  })
})

// Szczegóły wolontariusza
server.get('/api/v2/volunteers/:id', bearer, function(req, res) {
  Volunteers.read(req, 'Volunteers', {id: req.params.id}, {}, function (err, volunteer) {
    res.send(success({volunteer: volunteer}))
  })
})

// Aktualizacja wolontariusza
server.post('/api/v2/volunteers/:id', bearer, function(req, res) {
  var id = req.params.id
  // Sprawdź wymagane uprawnienia administratora lub właściciela profilu
  if(!req.user || !(req.user.is_admin || req.user.id === id)) {
    return res.status(403).send(error('AdminRequired'))
  }

  Volunteers.update(req, 'Volunteers', {id: id}, req.body, {}, function (err, volunteer) {
    if(err) { res.send(500) }
    else { res.status(200).send(success({volunteer: volunteer})) }
  })
})

// Dodawanie aktywności
server.post('/api/v2/activities', bearer, function(req, res) {
  Activities.create(req, 'Activities', {}, req.body, {}, function (err, result) {
    if(err) { res.send(501) }
    else {
      var activity = result.changes[0].new_val
      res.status(201).send(success({activity: activity}))
    }
  })
})

// Lista aktywności
server.get('/api/v2/activities', bearer, function(req, res) {
  Activities.read(req, 'Activities', {}, req.query, function (err, activities) {
    res.send(success({activities: activities}))
  })
})

// Szczegóły zadania
server.get('/api/v2/activities/:id', bearer, function(req, res) {
  Activities.read(req, 'Activities', {id: req.params.id}, {}, function (err, activity) {
    res.send(success({activity: activity}))
  })
})

// Aktualizacja aktywności
server.post('/api/v2/activities/:id', bearer, function(req, res) {
  var id = req.params.id

  Activities.update(req, 'Activities', {id: id}, req.body, {}, function (err, result) {
    if(err) { res.send(500) }
    else {
      var activity = result.changes[0].new_val
      res.status(200).send(success({activity: activity})) }
  })
})

// Dołączanie do zadania
server.post('/api/v2/activities/:id/join', bearer, function(req, res) {
  Activities.read(req, 'Activities', {id: req.params.id}, {}, function (err, activity) {
    if(err) { return res.send(err) }
    var body = { user_id: req.user.id }
    Joints.create(req, 'Joints', {}, body, {}, function (err, result) {
      var joint = result.changes[0].new_val
      res.send(success({joint: joint}))
    })
  })
})

// Wypisywanie z zadania
server.post('/api/v2/activities/:id/leave', bearer, function(req, res) {
  Activities.read(req, 'Activities', {id: req.params.id}, {}, function (err, activity) {
    var user_id = req.user.id
    var joint = activity.volunteers.find(function(volunteer) {
      return volunteer.user_id === user_id
    })
    if(!joint) { return res.status(400).send(error('NotJoined')) }
    var body = {
     id: joint.id,
     is_canceled: true
    }
    Joints.update(req, 'Joints', {}, body, {}, function (err, result) {
      var joint = result.changes[0].new_val
      res.send(success({joint: joint}))
    })
  })
})

// Zgłoszenie do aktywności
server.post('/api/v2/joints', bearer, function(req, res) {
  // Sprawdź wymagane uprawnienia administratora
  if(!req.user || !req.user.is_admin) {
    return res.status(403).send(error('AdminRequired'))
  }

  Joints.create(req, 'Joints', {}, req.body, {}, function (err, result) {
    if(err) {
      res.status(500).send(error('DBError', err))
    } else {
      var joint = result.changes[0].new_val
      res.status(201).send(success({joint: joint}))
    }
  })
})

// Szczegóły zgłoszenia do aktywności
server.get('/api/v2/joints/:id', bearer, function(req, res) {
  Joints.read(req, 'Joints', {id: req.params.id}, {}, function (err, joint) {
    if(err) {
      res.status(500).send(error('DBError', err))
    } else {
      res.send(success({joint: joint}))
    }
  })
})

// Aktualizacja zgłoszenia do aktywności
server.post('/api/v2/joints/:id', bearer, function(req, res) {
  // Sprawdź wymagane uprawnienia administratora
  if(!req.user || !req.user.is_admin) {
    return res.status(403).send(error('AdminRequired'))
  }

  Joints.update(req, 'Joints', {id: req.params.id}, req.body, {}, function (err, result) {
    if(err) {
      res.status(500).send(error('DBError', err))
    } else {
      var joint = result.changes[0].new_val
      res.send(success({joint: joint}))
    }
  })
})

// Domyślna ścieżka
server.use(function(req, res, next) {
  res.status(404).send(error('PathNotFound'))
})

// Obsługa błędów
server.use(function(err, req, res, next) {
  res.status(500).send(error('UnknownError', err))
})

// Baza noclegowa pielgrzymów
//server.get('/pilgrims', bearer, function(req, res) { })

if(__filename === process.argv[1]) {
  server.listen(config.api_port)
  console.log('Serwer został uruchomiony i jest dostępny pod adresem: http://127.0.0.1:'+config.api_port+'/.')
}
