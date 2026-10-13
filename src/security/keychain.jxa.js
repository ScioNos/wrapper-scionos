// Executed by macOS osascript, not Node. Secrets arrive only through stdin.
ObjC.import('Foundation');
ObjC.import('CoreFoundation');
ObjC.import('Security');

function run() {
  try {
    $.SecKeychainSetUserInteractionAllowed(false);
    var inputData = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    var input = JSON.parse($.NSString.alloc.initWithDataEncoding(inputData, $.NSUTF8StringEncoding).js);
    // Build a native dictionary: JXA's conversion of JavaScript objects and
    // booleans does not guarantee the CF types expected by Security.
    var query = $.NSMutableDictionary.alloc.init;
    query.setObjectForKey($.kSecClassGenericPassword, $.kSecClass);
    query.setObjectForKey($(input.namespace), $.kSecAttrService);
    query.setObjectForKey($(input.account), $.kSecAttrAccount);
    // This is the macOS file-based Keychain. Interaction was disabled above;
    // data-protection query flags are not accepted by its legacy item APIs.
    var status;
    if (input.operation === 'store') {
      var changes = $.NSMutableDictionary.alloc.init;
      var passwordData = $(input.token).dataUsingEncoding($.NSUTF8StringEncoding);
      changes.setObjectForKey(passwordData, $.kSecValueData);
      status = $.SecItemUpdate(query, changes);
      if (status === -25300) {
        query.setObjectForKey(passwordData, $.kSecValueData);
        status = $.SecItemAdd(query, null);
      }
    } else if (input.operation === 'get') {
      query.setObjectForKey($.kCFBooleanTrue, $.kSecReturnData);
      query.setObjectForKey($.kSecMatchLimitOne, $.kSecMatchLimit);
      var result = Ref();
      status = $.SecItemCopyMatching(query, result);
      if (status === 0) {
        return JSON.stringify({ status: 0, token: $.NSString.alloc.initWithDataEncoding(result[0], $.NSUTF8StringEncoding).js });
      }
    } else if (input.operation === 'delete') {
      status = $.SecItemDelete(query);
    } else {
      status = -50;
    }
    return JSON.stringify({ status: Number(status) });
  } catch (_) {
    return JSON.stringify({ status: -1 });
  }
}
