var ObjectId = require('mongodb').ObjectId; 

const addUser = (User) => ({ email, name, password, billingID, plan, endDate }) => {
  if (!email || !billingID || !plan) { throw new Error('Missing Data. Please provide values for email, billingID, plan') }

  const user = new User({ email, name, password, billingID, plan, endDate })
  return user.save()
}

const getUsers = (User) => () => {
  return User.find({})
}

const getUserByName = (User) => async (name) => {
  return await User.findOne({ name })
}

const getUserByEmail = (User) => async (email) => {
  return await User.findOne({ email })
}

const getUserById = (User) => async (id) => {
  return await User.findById( ObjectId(id) )
}

const getUserByBillingID = (User) => async (billingID) => {
  return await User.findOne({ billingID })
}

const updatePlan = (User) => (email, plan) => {
  return User.findOneAndUpdate({ email, plan })
}

module.exports = (User) => {
  return {
    addUser: addUser(User),
    getUsers: getUsers(User),
    getUserByEmail: getUserByEmail(User),
    getUserById: getUserById(User),
    updatePlan: updatePlan(User),
    getUserByBillingID: getUserByBillingID(User)
  }
}
