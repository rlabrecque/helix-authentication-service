//
// Copyright 2020 Perforce Software
//

//
// Defines the interface for persisting request entities.
//
// Requests may be orphaned if a login request never completes. Thus it is
// necessary for the request repository to ensure that old entries are removed
// several minutes after they are stored.
//
module.exports = class RequestRepository {
  add (requestIdentifier, requestModel) {
    return Promise.reject(new Error('not implemented'))
  }

  get (requestIdentifier) {
    return Promise.reject(new Error('not implemented'))
  }
}