function checkNotAuthenticated(req, res, next) {
  console.log(res);
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  next();
}

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
}

module.exports = {
  checkNotAuthenticated,
  checkAuthenticated,
};
