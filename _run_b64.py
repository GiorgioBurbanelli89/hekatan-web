import base64, sys
with open(sys.argv[1]) as bf:
    code = base64.b64decode(bf.read()).decode()
exec(code)
