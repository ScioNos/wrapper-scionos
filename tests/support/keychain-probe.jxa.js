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
  var serviceData = $('wrapper-scionos').dataUsingEncoding($.NSUTF8StringEncoding);
  var accountData = $(account).dataUsingEncoding($.NSUTF8StringEncoding);
  [false, true].forEach(function (strings) {
    try {
      results.push({ api: 'SecKeychainFindGenericPassword', strings: strings, status: Number($.SecKeychainFindGenericPassword(null, serviceData.length, strings ? 'wrapper-scionos' : serviceData.bytes, accountData.length, strings ? account : accountData.bytes, null, null, Ref())) });
    } catch (_) { results.push({ api: 'SecKeychainFindGenericPassword', strings: strings, status: 'bridge-error' }); }
  });
  try {
    results.push({ api: 'SecKeychainFindGenericPassword', boxedNil: true, status: Number($.SecKeychainFindGenericPassword($(), serviceData.length, 'wrapper-scionos', accountData.length, account, null, null, Ref())) });
  } catch (_) { results.push({ boxedNil: true, status: 'bridge-error' }); }
  return JSON.stringify(results);
}
