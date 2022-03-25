require('dotenv').config()
require('./src/connect/mongodb')
const bodyParser = require('body-parser')
const express = require('express')
const session = require('express-session')
var MemoryStore = require('memorystore')(session)
const UserService = require('./src/user')
const Stripe = require('./src/connect/stripe')
const setCurrentUser = require('./src/middleware/setCurrentUser')
const hasPlan = require('./src/middleware/hasPlan')

const passport = require("passport");
const flash = require("express-flash");
const methodOverride = require("method-override");
const bcrypt = require("bcryptjs");
const {
  checkAuthenticated,
  checkNotAuthenticated,
} = require("./src/middleware/auth");
const db = process.env.MONGODB
const initializePassport = require("./passport-config");
const userService = require('./src/user/user.service')
initializePassport(
  passport,
  async (email) => {
    // console.log("in passport init", email);
    const userFound = await UserService.getUserByEmail( email );
    return userFound;
  },
  async (id) => {
    const userFound = await UserService.getUserById( id );
    return userFound;
  }
);
const app = express()
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(flash());

app.use(session({
  saveUninitialized: false,
  cookie: { maxAge: 86400000 },
  store: new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  resave: false,
  // secret: 'keyboard cat'
  secret: process.env.SESSION_SECRET
}))

app.use('/webhook', bodyParser.raw({ type: 'application/json' }))

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride("_method"));

app.use(express.static('public'))
app.engine('html', require('ejs').renderFile)

const productToPriceMap = {
  basic: process.env.PRODUCT_BASIC,
  pro: process.env.PRODUCT_PRO
}

app.get('/none', [setCurrentUser, hasPlan('none')], async function (
  req,
  res,
  next
) {
  res.status(200).render('none.ejs')
})

app.get('/basic', [setCurrentUser, hasPlan('basic')], async function (
  req,
  res,
  next
) {
  res.status(200).render('basic.ejs')
})

app.get('/pro', [setCurrentUser, hasPlan('pro')], async function (
  req,
  res,
  next
) {
  res.status(200).render('pro.ejs')
})

// app.get('/', function (req, res) {
//   res.render('login.ejs')
// })
app.get("/", checkAuthenticated, (req, res) => {
  res.render("index", { name: req.user.name });
});

app.get("/login", checkNotAuthenticated, (req, res) => {
  res.render("login");
});

app.get("/register", checkNotAuthenticated, (req, res) => {
  res.render("register");
});

app.post("/register", checkNotAuthenticated, async (req, res) => {
  console.log(req.body.email);
  let email = req.body.email
  const userFound = await UserService.getUserByEmail(email);

  if (userFound) {
    req.flash("error", "User with that email already exists");
    res.redirect("/register");
  } else {
    try {
      let customerInfo = {}
      customerInfo = await Stripe.addNewCustomer(email)
      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const user = await UserService.addUser({
        email: req.body.email,
        name: req.body.name,
        password: hashedPassword,
        billingID: customerInfo.id,
        plan: 'none',
        hasTrial: 'false',
        endDate: null
      });

      await user.save();
      console.log(
        `A new user signed up and addded to DB. The ID for ${req.body.email} is ${JSON.stringify(
          customerInfo
        )}`
      )
      res.redirect("/login");
    } catch (error) {
      console.log(error);
      res.redirect("/register");
    }
  }
});

app.post( "/login", checkNotAuthenticated,
  passport.authenticate("local", {
    successRedirect: "/account",
    failureRedirect: "/login",
    failureFlash: true,
  }), 
  async function (req, res) {
    req.session.email = req.body.email
    console.log("in post login", req.session.email);
  }
);
app.get('/account', async function (req, res) {
    let objectID  = req.session.passport.user
    let customer = await UserService.getUserById(objectID)
    if (!customer) {
      res.redirect('/')
    } else {
      res.render('account.ejs', { customer })
    }

    let customerInfo = {}
    customerInfo = await Stripe.getCustomerByID(customer.billingID)

  }
) ;

app.delete("/logout", (req, res) => {
  req.logOut();
  res.redirect("/login");
});

app.post('/checkout', setCurrentUser, async (req, res) => {
  console.log("in post checkout", req);
  const customer = req.user
  const { product, customerID } = req.body

  const price = productToPriceMap[product]

  try {
    const session = await Stripe.createCheckoutSession(customerID, price)

    const ms =
      new Date().getTime() + 1000 * 60 * 60 * 24 * process.env.TRIAL_DAYS
    const n = new Date(ms)

    customer.plan = product
    customer.hasTrial = true
    customer.endDate = n
    customer.save()

    res.send({
      sessionId: session.id
    })
  } catch (e) {
    console.log(e)
    res.status(400)
    return res.send({
      error: {
        message: e.message
      }
    })
  }
})

app.post('/billing', setCurrentUser, async (req, res) => {
  const { customer } = req.body
  console.log('customer', customer)

  const session = await Stripe.createBillingSession(customer)
  console.log('session', session)

  res.json({ url: session.url })
})

app.post('/webhook', async (req, res) => {
  let event

  try {
    event = Stripe.createWebhook(req.body, req.header('Stripe-Signature'))
  } catch (err) {
    console.log(err)
    return res.sendStatus(400)
  }

  const data = event.data.object

  console.log(event.type, data)
  switch (event.type) {
    case 'customer.created':
      console.log(JSON.stringify(data))
      break
    case 'invoice.paid':
      break
    case 'customer.subscription.created': {
      const user = await UserService.getUserByBillingID(data.customer)

      if (data.plan.id === process.env.PRODUCT_BASIC) {
        console.log('You are talking about basic product')
        user.plan = 'basic'
      }

      if (data.plan.id === process.env.PRODUCT_PRO) {
        console.log('You are talking about pro product')
        user.plan = 'pro'
      }

      user.hasTrial = true
      user.endDate = new Date(data.current_period_end * 1000)

      await user.save()

      break
    }
    case 'customer.subscription.updated': {
      // started trial
      const user = await UserService.getUserByBillingID(data.customer)

      if (data.plan.id == process.env.PRODUCT_BASIC) {
        console.log('You are talking about basic product')
        user.plan = 'basic'
      }

      if (data.plan.id === process.env.PRODUCT_PRO) {
        console.log('You are talking about pro product')
        user.plan = 'pro'
      }

      const isOnTrial = data.status === 'trialing'

      if (isOnTrial) {
        user.hasTrial = true
        user.endDate = new Date(data.current_period_end * 1000)
      } else if (data.status === 'active') {
        user.hasTrial = false
        user.endDate = new Date(data.current_period_end * 1000)
      }

      if (data.canceled_at) {
        // cancelled
        console.log('You just canceled the subscription' + data.canceled_at)
        user.plan = 'none'
        user.hasTrial = false
        user.endDate = null
      }
      console.log('actual', user.hasTrial, data.current_period_end, user.plan)

      await user.save()
      console.log('customer changed', JSON.stringify(data))
      break
    }
    default:
  }
  res.sendStatus(200)
})

const port = process.env.PORT || 4242

app.listen(port, () => console.log(`Listening on port ${port}!`))
