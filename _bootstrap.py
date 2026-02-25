import base64, os, sys
# Decode and run the actual replacement script
b64_path = sys.argv[1]
with open(b64_path, "r") as bf:
    data = base64.b64decode(bf.read())
script_path = b64_path.replace(".b64", ".py")
with open(script_path, "wb") as sf:
    sf.write(data)
exec(compile(data.decode("utf-8"), script_path, "exec"))
