// Executed by macOS osascript, not Node. Secrets arrive only through stdin.
ObjC.import('Foundation');
ObjC.import('Security');

function run() {
  try {
    $.SecKeychainSetUserInteractionAllowed(false);
    var inputData = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    var input = JSON.parse($.NSString.alloc.initWithDataEncoding(inputData, $.NSUTF8StringEncoding).js);
    var query = {};
    query[ObjC.unwrap($.kSecClass)] = $.kSecClassGenericPassword;
    query[ObjC.unwrap($.kSecAttrService)] = input.namespace;
    query[ObjC.unwrap($.kSecAttrAccount)] = input.account;
    query[ObjC.unwrap($.kSecUseAuthenticationUI)] = $.kSecUseAuthenticationUIFail;
    var status;
    if (input.operation === 'store') {
      var changes = {};
      changes[ObjC.unwrap($.kSecValueData)] = $(input.token).dataUsingEncoding($.NSUTF8StringEncoding);
      status = $.SecItemUpdate($(query), $(changes));
      if (status === -25300) {
        query[ObjC.unwrap($.kSecValueData)] = changes[ObjC.unwrap($.kSecValueData)];
        status = $.SecItemAdd($(query), null);
      }
    } else if (input.operation === 'get') {
      query[ObjC.unwrap($.kSecReturnData)] = true;
      query[ObjC.unwrap($.kSecMatchLimit)] = $.kSecMatchLimitOne;
      var result = Ref();
      status = $.SecItemCopyMatching($(query), result);
      if (status === 0) {
        return JSON.stringify({ status: 0, token: $.NSString.alloc.initWithDataEncoding(result[0], $.NSUTF8StringEncoding).js });
      }
    } else if (input.operation === 'delete') {
      status = $.SecItemDelete($(query));
    } else {
      status = -50;
    }
    return JSON.stringify({ status: Number(status) });
  } catch (_) {
    return JSON.stringify({ status: -1 });
  }
}
