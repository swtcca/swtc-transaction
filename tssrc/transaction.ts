import axios from "axios"
import { Wallet as baselib } from "swtc-factory"
import { Serializer as jser } from "swtc-serializer"
import * as utils from "swtc-utils"
import * as utf8 from "utf8"
/**
 * Post request to server with account secret
 * @param remote
 * @class
 */
class Transaction {
  public static set_clear_flags = {
    AccountSet: {
      asfRequireDest: 1,
      asfRequireAuth: 2,
      asfDisallowSWT: 3,
      asfDisableMaster: 4,
      asfNoFreeze: 6,
      asfGlobalFreeze: 7
    }
  }
  public static flags = {
    // Universal flags can apply to any transaction type
    Universal: {
      FullyCanonicalSig: 0x80000000
    },
    AccountSet: {
      RequireDestTag: 0x00010000,
      OptionalDestTag: 0x00020000,
      RequireAuth: 0x00040000,
      OptionalAuth: 0x00080000,
      DisallowSWT: 0x00100000,
      AllowSWT: 0x00200000
    },
    TrustSet: {
      SetAuth: 0x00010000,
      NoSkywell: 0x00020000,
      SetNoSkywell: 0x00020000,
      ClearNoSkywell: 0x00040000,
      SetFreeze: 0x00100000,
      ClearFreeze: 0x00200000
    },
    OfferCreate: {
      Passive: 0x00010000,
      ImmediateOrCancel: 0x00020000,
      FillOrKill: 0x00040000,
      Sell: 0x00080000
    },
    Payment: {
      NoSkywellDirect: 0x00010000,
      PartialPayment: 0x00020000,
      LimitQuality: 0x00040000
    },
    RelationSet: {
      Authorize: 0x00000001,
      Freeze: 0x00000011
    }
  }
  public static OfferTypes = ["Sell", "Buy"]
  public static RelationTypes = ["trust", "authorize", "freeze", "unfreeze"]
  public static AccountSetTypes = ["property", "delegate", "signer"]

  // start of static methods

  /*
   * static function build payment tx
   * @param options
   *    source|from|account source account, required
   *    destination|to destination account, required
   *    amount payment amount, required
   * @returns {Transaction}
   */
  public static buildPaymentTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    const src = options.source || options.from || options.account
    const dst = options.destination || options.to
    const amount = options.amount
    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (!utils.isValidAddress(dst)) {
      tx.tx_json.dst = new Error("invalid destination address")
      return tx
    }
    if (!utils.isValidAmount(amount)) {
      tx.tx_json.amount = new Error("invalid amount")
      return tx
    }

    tx.tx_json.TransactionType = "Payment"
    tx.tx_json.Account = src
    tx.tx_json.Amount = utils.ToAmount(amount)
    tx.tx_json.Destination = dst
    return tx
  }

  /**
   * offer create
   * @param options
   *    type: 'Sell' or 'Buy'
   *    source|from|account maker account, required
   *    taker_gets|pays amount to take out, required
   *    taker_pays|gets amount to take in, required
   * @returns {Transaction}
   */
  public static buildOfferCreateTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }

    const offer_type = options.type
    const src = options.source || options.from || options.account
    const taker_gets = options.taker_gets || options.pays
    const taker_pays = options.taker_pays || options.gets
    const app = options.app

    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (
      typeof offer_type !== "string" ||
      !~Transaction.OfferTypes.indexOf(offer_type)
    ) {
      tx.tx_json.offer_type = new Error("invalid offer type")
      return tx
    }
    if (typeof taker_gets === "string" && !Number(taker_gets)) {
      tx.tx_json.taker_gets2 = new Error("invalid to pays amount")
      return tx
    }
    if (typeof taker_gets === "object" && !utils.isValidAmount(taker_gets)) {
      tx.tx_json.taker_gets2 = new Error("invalid to pays amount object")
      return tx
    }
    if (typeof taker_pays === "string" && !Number(taker_pays)) {
      tx.tx_json.taker_pays2 = new Error("invalid to gets amount")
      return tx
    }
    if (typeof taker_pays === "object" && !utils.isValidAmount(taker_pays)) {
      tx.tx_json.taker_pays2 = new Error("invalid to gets amount object")
      return tx
    }
    if (app && !/^[0-9]*[1-9][0-9]*$/.test(app)) {
      // 正整数
      tx.tx_json.app = new Error("invalid app, it is a positive integer.")
      return tx
    }

    tx.tx_json.TransactionType = "OfferCreate"
    if (offer_type === "Sell") tx.setFlags(offer_type)
    if (app) tx.tx_json.AppType = app
    tx.tx_json.Account = src
    tx.tx_json.TakerPays = utils.ToAmount(taker_pays, remote._token || "swt")
    tx.tx_json.TakerGets = utils.ToAmount(taker_gets, remote._token || "swt")

    return tx
  }

  /**
   * offer cancel
   * @param options
   *    source|from|account source account, required
   *    sequence, required
   * @returns {Transaction}
   */
  public static buildOfferCancelTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }

    const src = options.source || options.from || options.account
    const sequence = options.sequence

    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (!Number(sequence)) {
      tx.tx_json.sequence = new Error("invalid sequence param")
      return tx
    }

    tx.tx_json.TransactionType = "OfferCancel"
    tx.tx_json.Account = src
    tx.tx_json.OfferSequence = Number(sequence)

    return tx
  }

  /**
   * contract
   * @param options
   *    account, required
   *    amount, required
   *    payload, required
   * @returns {Transaction}
   */
  public static deployContractTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    const account = options.account
    const amount = options.amount
    const payload = options.payload
    const params = options.params
    if (!utils.isValidAddress(account)) {
      tx.tx_json.account = new Error("invalid address")
      return tx
    }
    if (isNaN(Number(amount))) {
      tx.tx_json.amount = new Error("invalid amount")
      return tx
    }
    if (typeof payload !== "string") {
      tx.tx_json.payload = new Error("invalid payload: type error.")
      return tx
    }
    if (params && !Array.isArray(params)) {
      tx.tx_json.params = new Error("invalid options type")
      return tx
    }

    tx.tx_json.TransactionType = "ConfigContract"
    tx.tx_json.Account = account
    tx.tx_json.Amount = Number(amount) * 1000000
    tx.tx_json.Method = 0
    tx.tx_json.Payload = payload
    tx.tx_json.Args = []
    for (const param of params) {
      const obj: any = {}
      obj.Arg = {
        Parameter: utils.stringToHex(param)
      }
      tx.tx_json.Args.push(obj)
    }
    return tx
  }

  /**
   * contract
   * @param options
   *    account, required
   *    des, required
   *    params, required
   * @returns {Transaction}
   */
  public static callContractTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    const account = options.account
    const des = options.destination
    const params = options.params
    const foo = options.foo // 函数名
    if (!utils.isValidAddress(account)) {
      tx.tx_json.account = new Error("invalid address")
      return tx
    }
    if (!utils.isValidAddress(des)) {
      tx.tx_json.des = new Error("invalid destination")
      return tx
    }

    if (params && !Array.isArray(params)) {
      tx.tx_json.params = new Error("invalid options type")
      return tx
    }
    if (typeof foo !== "string") {
      tx.tx_json.foo = new Error("foo must be string")
      return tx
    }

    tx.tx_json.TransactionType = "ConfigContract"
    tx.tx_json.Account = account
    tx.tx_json.Method = 1
    tx.tx_json.ContractMethod = utils.stringToHex(foo)
    tx.tx_json.Destination = des
    tx.tx_json.Args = []
    for (const param of params) {
      if (typeof param !== "string") {
        tx.tx_json.params = new Error("params must be string")
        return tx
      }
      const obj: any = {}
      obj.Arg = {
        Parameter: utils.stringToHex(param)
      }
      tx.tx_json.Args.push(obj)
    }
    return tx
  }

  // signer set, seems discontinued
  public static buildSignTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }

    tx.tx_json.TransactionType = "Signer"
    tx.tx_json.blob = options.blob

    return tx
  }

  /**
   * account information set
   * @param options
   *    type: Transaction.AccountSetTypes
   * @returns {Transaction}
   */
  public static buildAccountSetTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    if (Transaction.AccountSetTypes.indexOf(options.type) === -1) {
      tx.tx_json.type = new Error("invalid account set type")
      return tx
    }
    switch (options.type) {
      case "property":
        return Transaction.__buildAccountSet(options, tx)
      case "delegate":
        return Transaction.__buildDelegateKeySet(options, tx)
      case "signer":
        return Transaction.__buildSignerSet(options, tx)
    }
  }

  /**
   * add wallet relation set
   * @param options
   *    type: Transaction.RelationTypes
   *    source|from|account source account, required
   *    limit limt amount, required
   *    quality_out, optional
   *    quality_in, optional
   * @returns {Transaction}
   */
  public static buildRelationTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    if (!~Transaction.RelationTypes.indexOf(options.type)) {
      tx.tx_json.type = new Error("invalid relation type")
      return tx
    }
    switch (options.type) {
      case "trust":
        return Transaction.__buildTrustSet(options, tx)
      case "authorize":
      case "freeze":
      case "unfreeze":
        return Transaction.__buildRelationSet(options, tx)
    }
  }

  /**
   * Brokerage 设置挂单手续费
   * @param options
   *    account, required
   *    mol|molecule, required
   *    den|denominator, required
   *    app, required
   *    amount, required
   * @returns {Transaction}
   */
  public static buildBrokerageTx(options, remote: any = {}) {
    const tx = new Transaction(remote)
    if (options === null || typeof options !== "object") {
      tx.tx_json.obj = new Error("invalid options type")
      return tx
    }
    const account = options.account
    const mol = options.mol || options.molecule
    const den = options.den || options.denominator
    const app = options.app
    const amount = options.amount
    if (!utils.isValidAddress(account)) {
      tx.tx_json.src = new Error("invalid address")
      return tx
    }
    if (!/^\d+$/.test(mol)) {
      // (正整数 + 0)
      tx.tx_json.mol = new Error(
        "invalid mol, it is a positive integer or zero."
      )
      return tx
    }
    if (!/^[0-9]*[1-9][0-9]*$/.test(den) || !/^[0-9]*[1-9][0-9]*$/.test(app)) {
      // 正整数
      tx.tx_json.den = new Error("invalid den/app, it is a positive integer.")
      return tx
    }
    if (mol > den) {
      tx.tx_json.app = new Error(
        "invalid mol/den, molecule can not exceed denominator."
      )
      return tx
    }
    if (!utils.isValidAmount(amount)) {
      tx.tx_json.amount = new Error("invalid amount")
      return tx
    }
    tx.tx_json.TransactionType = "Brokerage"
    tx.tx_json.Account = account // 管理员账号
    tx.tx_json.OfferFeeRateNum = mol // 分子(正整数 + 0)
    tx.tx_json.OfferFeeRateDen = den // 分母(正整数)
    tx.tx_json.AppType = app // 应用来源(正整数)
    tx.tx_json.Amount = utils.ToAmount(amount) // 币种,这里amount字段中的value值只是占位，没有实际意义

    return tx
  }

  private static __buildTrustSet(options, tx) {
    const src = options.source || options.from || options.account
    const limit = options.limit
    const quality_out = options.quality_out
    const quality_in = options.quality_in

    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (!utils.isValidAmount(limit)) {
      tx.tx_json.limit = new Error("invalid amount")
      return tx
    }

    tx.tx_json.TransactionType = "TrustSet"
    tx.tx_json.Account = src
    tx.tx_json.LimitAmount = limit
    if (quality_in) {
      tx.tx_json.QualityIn = quality_in
    }
    if (quality_out) {
      tx.tx_json.QualityOut = quality_out
    }
    return tx
  }

  private static __buildRelationSet(options, tx) {
    const src = options.source || options.from || options.account
    const des = options.target
    const limit = options.limit

    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (!utils.isValidAddress(des)) {
      tx.tx_json.des = new Error("invalid target address")
      return tx
    }
    if (!utils.isValidAmount(limit)) {
      tx.tx_json.limit = new Error("invalid amount")
      return tx
    }

    tx.tx_json.TransactionType =
      options.type === "unfreeze" ? "RelationDel" : "RelationSet"
    tx.tx_json.Account = src
    tx.tx_json.Target = des
    tx.tx_json.RelationType = options.type === "authorize" ? 1 : 3
    tx.tx_json.LimitAmount = limit
    return tx
  }

  /**
   * account information set
   * @param options
   *    set_flag, flags to set
   *    clear_flag, flags to clear
   * @returns {Transaction}
   */
  private static __buildAccountSet(options, tx) {
    const src = options.source || options.from || options.account
    let set_flag = options.set_flag || options.set
    let clear_flag = options.clear_flag || options.clear
    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }

    tx.tx_json.TransactionType = "AccountSet"
    tx.tx_json.Account = src

    const SetClearFlags = Transaction.set_clear_flags.AccountSet

    function prepareFlag(flag) {
      return typeof flag === "number"
        ? flag
        : SetClearFlags[flag] || SetClearFlags["asf" + flag]
    }

    if (set_flag) {
      set_flag = prepareFlag(set_flag)
      if (set_flag) {
        tx.tx_json.SetFlag = set_flag
      }
    }

    if (clear_flag) {
      clear_flag = prepareFlag(clear_flag)
      if (clear_flag) {
        tx.tx_json.ClearFlag = clear_flag
      }
    }

    return tx
  }

  /**
   * delegate key setting
   * @param options
   *    source|account|from, source account, required
   *    delegate_key, delegate account, required
   * @returns {Transaction}
   */
  private static __buildDelegateKeySet(options, tx) {
    const src = options.source || options.account || options.from
    const delegate_key = options.delegate_key

    if (!utils.isValidAddress(src)) {
      tx.tx_json.src = new Error("invalid source address")
      return tx
    }
    if (!utils.isValidAddress(delegate_key)) {
      tx.tx_json.delegate_key = new Error("invalid regular key address")
      return tx
    }

    tx.tx_json.TransactionType = "SetRegularKey"
    tx.tx_json.Account = src
    tx.tx_json.RegularKey = delegate_key

    return tx
  }

  private static __buildSignerSet(options: any, tx: any) {
    // TODO
    tx.tx_json.delegate_key =
      options.deletegate_key || new Error("not implemented yet")
    return tx
  }
  // end of static transaction builds

  public readonly _token: string
  public tx_json
  public _secret: string | undefined
  public _filter
  private _remote: any
  constructor(remote, filter = v => v) {
    this._remote = remote
    this._token = remote._token || "swt"
    this.tx_json = { Flags: 0, Fee: utils.getFee(this._token) }
    this._filter = filter
  }

  /**
   * parse json transaction as tx_json
   * @param val
   * @returns {Transaction}
   */
  public parseJson(val) {
    this.tx_json = val
    return this
  }

  /**
   * get transaction account
   * @returns {Transaction.tx_json.Account}
   */
  public getAccount() {
    return this.tx_json.Account
  }

  /**
   * get transaction type
   * @returns {exports.result.TransactionType|*|string}
   */
  public getTransactionType() {
    return this.tx_json.TransactionType
  }

  /**
   * set secret
   * @param secret
   */
  public setSecret(secret) {
    if (!baselib.isValidSecret(secret)) {
      this.tx_json._secret = new Error("invalid secret")
      return
    }
    this._secret = secret
  }

  /**
   * just only memo data
   * @param memo
   */
  public addMemo(memo) {
    if (typeof memo !== "string") {
      this.tx_json.memo_type = new TypeError("invalid memo type")
      return this
    }
    if (memo.length > 2048) {
      this.tx_json.memo_len = new TypeError("memo is too long")
      return this
    }
    const _memo: any = {}
    _memo.MemoData = utils.stringToHex(utf8.encode(memo))
    this.tx_json.Memos = (this.tx_json.Memos || []).concat({ Memo: _memo })
  }

  public setFee(fee) {
    const _fee = parseInt(fee, 10)
    if (isNaN(_fee)) {
      this.tx_json.Fee = new TypeError("invalid fee")
      return this
    }
    if (fee < 10) {
      this.tx_json.Fee = new TypeError("fee is too low")
      return this
    }
    this.tx_json.Fee = _fee
  }

  /**
   * set source tag
   * source tag is a 32 bit integer or undefined
   * @param tag
   */
  /*
  setSourceTag function(tag) {
      if (typeof tag !== Number || !isFinite(tag)) {
          throw new Error('invalid tag type');
      }
      this.tx_json.SourceTag = tag;
  };

  setDestinationTag function(tag) {
      if (typeof tag !== Number || !isFinite(tag)) {
          throw new Error('invalid tag type');
      }
      this.tx_json.DestinationTag = tag;
  };
  */

  /**
   * set a path to payment
   * this path is repesented as a key, which is computed in path find
   * so if one path you computed self is not allowed
   * when path set, sendmax is also set.
   * @param path
   */
  public setPath(key) {
    // sha1 string
    if (typeof key !== "string" || key.length !== 40) {
      return new Error("invalid path key")
    }
    const item = this._remote._paths.get(key)
    if (!item) {
      return new Error("non exists path key")
    }
    if (item.path === "[]") {
      // 沒有支付路径，不需要传下面的参数
      return
    }
    const path = JSON.parse(item.path)
    this.tx_json.Paths = path
    const amount = MaxAmount(item.choice)
    this.tx_json.SendMax = amount
  }

  /**
   * limit send max amount
   * @param amount
   */
  public setSendMax(amount) {
    if (!utils.isValidAmount(amount)) {
      return new Error("invalid send max amount")
    }
    this.tx_json.SendMax = amount
  }

  /**
   * transfer rate
   * between 0 and 1, type is number
   * @param rate
   */
  public setTransferRate(rate) {
    if (typeof rate !== "number" || rate < 0 || rate > 1) {
      return new Error("invalid transfer rate")
    }
    this.tx_json.TransferRate = (rate + 1) * 1e9
  }

  /**
   * set transaction flags
   *
   */
  public setFlags(flags) {
    if (flags === void 0) return

    if (typeof flags === "number") {
      this.tx_json.Flags = flags
      return
    }
    const transaction_flags = Transaction.flags[this.getTransactionType()] || {}
    const flag_set = Array.isArray(flags) ? flags : [].concat(flags)
    for (const flag of flag_set) {
      if (transaction_flags.hasOwnProperty(flag)) {
        this.tx_json.Flags += transaction_flags[flag]
      }
    }
  }

  /* set sequence */
  public setSequence(sequence) {
    if (!/^\+?[1-9][0-9]*$/.test(sequence)) {
      // 正整数
      this.tx_json.Sequence = new TypeError("invalid sequence")
      return this
    }

    this.tx_json.Sequence = Number(sequence)
  }

  public sign(callback) {
    const self = this
    if (self.tx_json.Sequence) {
      signing(self, callback)
      // callback(null, signing(self));
    } else if ("requestAccountInfo" in this._remote) {
      const req = this._remote.requestAccountInfo({
        account: self.tx_json.Account,
        type: "trust"
      })
      req.submit((err, data) => {
        if (err) return callback(err)
        self.tx_json.Sequence = data.account_data.Sequence
        signing(self, callback)
        // callback(null, signing(self));
      })
    } else if ("getAccountBalances" in this._remote) {
      this._remote
        .getAccountBalances(self.tx_json.Account)
        .then(data => {
          self.tx_json.Sequence = data.sequence
          signing(self, callback)
        })
        .catch(error => {
          throw error
        })
    } else if ("_axios" in this._remote) {
      this._remote._axios
        .get(`accounts/${self.tx_json.Account}/balances`)
        .then(response => {
          self.tx_json.Sequence = response.data.sequence
          signing(self, callback)
        })
        .catch(error => {
          throw error
        })
    } else {
      // use api.jingtum.com to get sequence
      axios
        .get(
          `https://api.jingtum.com/v2/accounts/${self.tx_json.Account}/balances`
        )
        .then(response => {
          self.tx_json.Sequence = response.data.sequence
          signing(self, callback)
        })
        .catch(error => {
          throw error
        })
    }
  }

  public signPromise() {
    return new Promise((resolve, reject) => {
      if (this.tx_json.Sequence) {
        signing(this, (error, blob) => {
          if (error) {
            reject(error)
          } else {
            resolve(blob)
          }
        })
        // callback(null, signing(this));
      } else if ("requestAccountInfo" in this._remote) {
        const req = this._remote.requestAccountInfo({
          account: this.tx_json.Account,
          type: "trust"
        })
        req.submit((err, data) => {
          if (err) {
            reject(err)
          } else {
            this.tx_json.Sequence = data.account_data.Sequence
          }
          signing(this, (error, blob) => {
            if (error) {
              reject(error)
            } else {
              resolve(blob)
            }
          })
          // callback(null, signing(this));
        })
      } else if ("getAccountBalances" in this._remote) {
        this._remote
          .getAccountBalances(this.tx_json.Account)
          .then(data => {
            this.tx_json.Sequence = data.sequence
            signing(this, (error, blob) => {
              if (error) {
                reject(error)
              } else {
                resolve(blob)
              }
            })
          })
          .catch(error => {
            reject(error)
          })
      } else if ("_axios" in this._remote) {
        this._remote._axios
          .get(`accounts/${this.tx_json.Account}/balances`)
          .then(response => {
            this.tx_json.Sequence = response.data.sequence
            signing(this, (error, blob) => {
              if (error) {
                reject(error)
              } else {
                resolve(blob)
              }
            })
          })
          .catch(error => {
            reject(error)
          })
      } else {
        // use api.jingtum.com to get sequence
        axios
          .get(
            `https://api.jingtum.com/v2/accounts/${
              this.tx_json.Account
            }/balances`
          )
          .then(response => {
            this.tx_json.Sequence = response.data.sequence
            signing(this, (error, blob) => {
              if (error) {
                reject(error)
              } else {
                resolve(blob)
              }
            })
          })
          .catch(error => {
            reject(error)
          })
      }
    })
  }

  /**
   * submit request to server
   * @param callback
   */
  public submit(callback) {
    const self = this
    for (const key in self.tx_json) {
      if (self.tx_json[key] instanceof Error) {
        return callback(self.tx_json[key].message)
      }
    }

    let data = {}
    if (self.tx_json.TransactionType === "Signer") {
      // 直接将blob传给底层
      data = {
        tx_blob: self.tx_json.blob
      }
      self._remote._submit("submit", data, self._filter, callback)
    } else if (self._remote._local_sign) {
      // 签名之后传给底层
      self.sign((err, blob) => {
        if (err) {
          return callback("sign error: " + err)
        } else {
          data = { tx_blob: blob }
          self._remote._submit("submit", data, self._filter, callback)
        }
      })
    } else {
      // 不签名交易传给底层
      data = {
        secret: self._secret,
        tx_json: self.tx_json
      }
      self._remote._submit("submit", data, self._filter, callback)
    }
  }

  public async submitPromise() {
    for (const key in this.tx_json) {
      if (this.tx_json[key] instanceof Error) {
        return Promise.reject(this.tx_json[key].message)
      }
    }
    let blob
    if (!("blob" in this.tx_json)) {
      blob = await this.signPromise()
    } else {
      blob = this.tx_json.blob
    }
    const data = {
      blob
    }
    if ("submitPromise" in this._remote) {
      // lib remote
      return this._remote.submitPromise(this)
    } else if ("postBlob" in this._remote) {
      // api remote
      return this._remote.postBlob(data)
    } else if ("_axios" in this._remote) {
      // api remote
      return this._remote._axios.post(`blob`, data)
    } else {
      // use api.jingtum.com directly
      return axios.post(`https://api.jingtum.com/v2/blob`, data)
    }
  }

  public submitApi() {
    const self = this
    for (const key in self.tx_json) {
      if (self.tx_json[key] instanceof Error) {
        return Promise.reject(self.tx_json[key].message)
      }
    }

    let data = {}
    if ("blob" in self.tx_json) {
      data = {
        blob: self.tx_json.blob
      }
      if ("postBlob" in self._remote) {
        // api remote
        return self._remote.postBlob(data)
      } else if ("_axios" in self._remote) {
        // api remote
        return self._remote._axios.post(`blob`, data)
      } else {
        // use api.jingtum.com directly
        return axios.post(`https://api.jingtum.com/v2/blob`, data)
      }
    } else {
      return Promise.reject("please local sign before this submit")
    }
  }
}

function MaxAmount(amount) {
  if (typeof amount === "string" && Number(amount)) {
    const _amount = parseInt(String(Number(amount) * 1.0001), 10)
    return String(_amount)
  }
  if (typeof amount === "object" && utils.isValidAmount(amount)) {
    const _value = Number(amount.value) * 1.0001
    amount.value = String(_value)
    return amount
  }
  return new Error("invalid amount to max")
}
function signing(self, callback) {
  self.tx_json.Fee = self.tx_json.Fee / 1000000

  // payment
  if (
    self.tx_json.Amount &&
    JSON.stringify(self.tx_json.Amount).indexOf("{") < 0
  ) {
    // 基础货币
    self.tx_json.Amount = Number(self.tx_json.Amount) / 1000000
  }
  if (self.tx_json.Memos) {
    const memos = self.tx_json.Memos
    for (const memo of memos) {
      memo.Memo.MemoData = utf8.decode(utils.hexToString(memo.Memo.MemoData))
    }
  }
  if (self.tx_json.SendMax && typeof self.tx_json.SendMax === "string") {
    self.tx_json.SendMax = Number(self.tx_json.SendMax) / 1000000
  }

  // order
  if (
    self.tx_json.TakerPays &&
    JSON.stringify(self.tx_json.TakerPays).indexOf("{") < 0
  ) {
    // 基础货币
    self.tx_json.TakerPays = Number(self.tx_json.TakerPays) / 1000000
  }
  if (
    self.tx_json.TakerGets &&
    JSON.stringify(self.tx_json.TakerGets).indexOf("{") < 0
  ) {
    // 基础货币
    self.tx_json.TakerGets = Number(self.tx_json.TakerGets) / 1000000
  }
  try {
    const wt = new baselib(self._secret)
    self.tx_json.SigningPubKey = wt.getPublicKey()
    const prefix = 0x53545800
    const hash = jser.from_json(self.tx_json).hash(prefix)
    self.tx_json.TxnSignature = wt.signTx(hash)
    self.tx_json.blob = jser.from_json(self.tx_json).to_hex()
    self._local_sign = true
    callback(null, self.tx_json.blob)
  } catch (e) {
    callback(e)
  }
}

export { Transaction }
