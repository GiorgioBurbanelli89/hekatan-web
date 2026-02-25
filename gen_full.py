import base64, os

DQ = chr(34)
BS = chr(92)
DDQ = DQ+DQ
EM = chr(8212)
NL = chr(10)

def q(s):
    return DDQ+s+DDQ

M = []
