// Read-only diagnostic queries target an account that cannot match user tokens.
ObjC.import('Foundation');
ObjC.import('CoreFoundation');
ObjC.import('Security');

function run() {
  $.SecKeychainSetUserInteractionAllowed(false);
  var account = 'wrapper-scionos-test-probe-' + Date.now() + '-' + Math.random();
  var results = [];
  [false, true].forEach(function (authenticationFlag) {
    var query = $.NSMutableDictionary.alloc.init;
    query.setObjectForKey($.kSecClassGenericPassword, $.kSecClass);
    query.setObjectForKey($('wrapper-scionos'), $.kSecAttrService);
    query.setObjectForKey($(account), $.kSecAttrAccount);
    query.setObjectForKey($.kCFBooleanTrue, $.kSecReturnData);
    query.setObjectForKey($.kSecMatchLimitOne, $.kSecMatchLimit);
    if (authenticationFlag) query.setObjectForKey($.kSecUseAuthenticationUIFail, $.kSecUseAuthenticationUI);
    results.push({ authenticationFlag: authenticationFlag, status: Number($.SecItemCopyMatching(query, Ref())) });
  });
  return JSON.stringify(results);
}
