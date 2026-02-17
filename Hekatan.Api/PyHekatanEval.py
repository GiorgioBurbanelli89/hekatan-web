# PyHekatanRun.py

from PyHekatanWrapper import Calculator, MathSettings
# Initialize and use the Settings and Calculator classes
settings = MathSettings()
settings.Decimals = 15
calc = Calculator(settings)

# Initialize terminal colors
import os
os.system("color")
from termcolor import colored
    
# Caclulate expressions with Hekatan
print("Simple Python calculator using PyHekatan Eval method.")
print("Enter math expressions to evaluate. Press Enter to quit.")
while 1:
    try:
        print("In:")
        expr = input("    ")
        if len(expr) == 0:
            break
        print("Out:")
        print(colored(f"    {calc.Eval(expr)}", 'green'))
    except Exception as e:
        print(colored(f"    {str(e).splitlines()[0]}", 'red'))

os.system("pause")