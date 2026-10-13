// Executed by macOS osascript, not Node. Secrets arrive only through stdin.
ObjC.import('Foundation');
ObjC.import('Security');

function run() {
  try {
    $.SecKeychainSetUserInteractionAllowed(false);
    var inputData = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
    var input = JSON.parse($.NSString.alloc.initWithDataEncoding(inputData, $.NSUTF8StringEncoding).js);
    // Use explicit UTF-8 buffers with the file-based Keychain APIs. This avoids
    // JXA's ambiguous conversion of a query dictionary to CFDictionaryRef.
    var service = $(input.namespace).dataUsingEncoding($.NSUTF8StringEncoding);
    var account = $(input.account).dataUsingEncoding($.NSUTF8StringEncoding);
    var item = Ref();
    var status;
    if (input.operation === 'store') {
      var password = $(input.token).dataUsingEncoding($.NSUTF8StringEncoding);
      status = $.SecKeychainAddGenericPassword($(), service.length, input.namespace, account.length, input.account, password.length, password.bytes, null);
      if (status === -25299) {
        status = $.SecKeychainFindGenericPassword($(), service.length, input.namespace, account.length, input.account, null, null, item);
        if (status === 0) {
          // JXA owns the bridged item object. The helper exits after this one
          // operation; manually CFReleasing its wrapper can double-release it.
          status = $.SecKeychainItemModifyAttributesAndData(item[0], null, password.length, password.bytes);
        }
      }
    } else if (input.operation === 'get') {
      var length = Ref();
      var bytes = Ref();
      status = $.SecKeychainFindGenericPassword($(), service.length, input.namespace, account.length, input.account, length, bytes, null);
      if (status === 0) {
        try {
          var data = $.NSData.dataWithBytesLength(bytes[0], length[0]);
          return JSON.stringify({ status: 0, token: $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js });
        } finally {
          $.SecKeychainItemFreeContent(null, bytes[0]);
        }
      }
    } else if (input.operation === 'delete') {
      status = $.SecKeychainFindGenericPassword($(), service.length, input.namespace, account.length, input.account, null, null, item);
      if (status === 0) {
        status = $.SecKeychainItemDelete(item[0]);
      }
    } else {
      status = -50;
    }
    return JSON.stringify({ status: Number(status) });
  } catch (_) {
    return JSON.stringify({ status: -1 });
  }
}
