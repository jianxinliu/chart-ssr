module.exports = {
  renderState: {
    PENDING: 'PENDING',
    DONE: 'DONE',
    ERROR: 'ERROR',
    isError: (state) => state === 'ERROR',
    isPending: (state) => state === 'PENDING',
    isDone: (state) => state === 'DONE'
  },
  emptyResult(state, uid, msg = '') {
    if (!uid) {
      throw new Error('uid empty')
    }
    return {
      uid: '',
      state,
      msg,
      result: []
    }
  }
}