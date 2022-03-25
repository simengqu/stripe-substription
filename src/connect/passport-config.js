const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
var ObjectId = require('mongodb').ObjectId; 

function initialize(passport, getUserByEmail, getUserById) {
  console.log("in initialize", getUserByEmail, getUserById);
  const authenticateUser = async (email, password, done) => {
    console.log(email, password);
    const user = await getUserByEmail(email);
    console.log("user", user);
    if (user == null) {
      return done(null, false, { message: "No user with that email" });
    }

    try {
      if (await bcrypt.compare(password, user.password)) {
        return done(null, user);
      } else {
        return done(null, false, { message: "Password incorrect" });
      }
    } catch (err) {
      console.log("error in auth")
      return done(e);
    }
  };

  passport.use(new LocalStrategy({ usernameField: "email" }, authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    return done(null, await getUserById(id));
  });
}

module.exports = initialize;
