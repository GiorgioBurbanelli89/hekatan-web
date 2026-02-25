% Test: gnuplot PNG → base64 → @@image DSL
graphics_toolkit('gnuplot');
set(0, 'defaultfigurevisible', 'off');

hf = figure();
set(hf, '__graphics_toolkit__', 'gnuplot');

x = linspace(0, 2*pi, 200);
plot(x, sin(x), '-r', 'LineWidth', 2);
hold on;
plot(x, cos(x), '--b', 'LineWidth', 2);
hold off;
title('Test PNG via gnuplot');
xlabel('x'); ylabel('y');
legend('sin(x)', 'cos(x)');
grid on;

tmpf = [tempname() '.png'];
print(hf, tmpf, '-dpng', '-r150');

fid = fopen(tmpf, 'rb');
data = fread(fid, Inf, 'uint8');
fclose(fid);

b64 = base64_encode(uint8(data'));
fprintf('@@image data:image/png;base64,%s|Test Plot|100%%|Gnuplot PNG Test\n', b64);

delete(tmpf);
