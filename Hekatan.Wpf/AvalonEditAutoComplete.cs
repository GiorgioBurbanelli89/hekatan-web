using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit;
using ICSharpCode.AvalonEdit.Document;
using Hekatan.Core;

namespace Hekatan.Wpf
{
    /// <summary>
    /// AutoComplete manager for AvalonEdit TextEditor
    /// Provides the same autocomplete functionality as AutoCompleteManager but for AvalonEdit
    /// </summary>
    internal class AvalonEditAutoComplete
    {
        private readonly TextEditor _textEditor;
        private readonly ListBox _listBox;
        private readonly Dispatcher _dispatcher;
        private int _autoCompleteStartOffset;
        private readonly int _autoCompleteCount;

        internal AvalonEditAutoComplete(TextEditor textEditor, ListBox listBox, Dispatcher dispatcher)
        {
            _textEditor = textEditor;
            _listBox = listBox;
            _dispatcher = dispatcher;

            // Hook events
            _textEditor.TextArea.TextEntered += TextArea_TextEntered;
            _textEditor.TextArea.PreviewKeyDown += TextArea_PreviewKeyDown;
            _listBox.PreviewMouseLeftButtonUp += AutoCompleteListBox_PreviewMouseLeftButtonUp;
            _listBox.PreviewKeyDown += AutoCompleteListBox_PreviewKeyDown;

            // Count built-in items (to know where user-defined items start)
            _autoCompleteCount = _listBox.Items.Count;
        }

        /// <summary>
        /// Handle text entered in AvalonEdit
        /// </summary>
        private void TextArea_TextEntered(object? sender, TextCompositionEventArgs e)
        {
            if (string.IsNullOrEmpty(e.Text))
                return;

            var c = e.Text[0];
            bool isAutoCompleteTrigger = Validator.IsLetter(c);
            if (!isAutoCompleteTrigger)
            {
                if (_listBox.Visibility == Visibility.Hidden)
                    isAutoCompleteTrigger = c == '#' || c == '$' || c == '@';
                else
                    isAutoCompleteTrigger = c == '/' || c == '*' || c == '^' || c == '{';
            }

            if (isAutoCompleteTrigger)
            {
                int offset = _textEditor.CaretOffset;
                if (_listBox.Visibility == Visibility.Hidden)
                {
                    // Get text before cursor on current line
                    var line = _textEditor.Document.GetLineByOffset(offset);
                    var lineText = _textEditor.Document.GetText(line.Offset, offset - line.Offset);
                    var i = lineText.Length - 1;
                    var c0 = i < 0 ? '\0' : lineText[i];

                    // Check if we're starting a new word
                    if (!Validator.IsLetter(c0))
                    {
                        _autoCompleteStartOffset = offset;
                        SetAutoCompletePosition();
                        FilterAutoComplete(c0, c.ToString());
                    }
                }
                else
                {
                    UpdateAutoComplete(e.Text);
                }
            }
            else
            {
                _listBox.Visibility = Visibility.Hidden;
            }
        }

        /// <summary>
        /// Handle key events in AvalonEdit
        /// </summary>
        private void TextArea_PreviewKeyDown(object? sender, KeyEventArgs e)
        {
            if (_listBox.Visibility != Visibility.Visible)
                return;

            switch (e.Key)
            {
                case Key.Left:
                case Key.Right:
                case Key.PageUp:
                case Key.PageDown:
                case Key.Home:
                case Key.End:
                case Key.Delete:
                case Key.Enter:
                case Key.Space:
                case Key.LeftCtrl:
                case Key.RightCtrl:
                case Key.LeftAlt:
                case Key.RightAlt:
                    _listBox.Visibility = Visibility.Hidden;
                    return;
                case Key.Up:
                case Key.Down:
                    if (e.Key == Key.Down ^ _listBox.VerticalAlignment == VerticalAlignment.Bottom)
                    {
                        _listBox.Focus();
                        e.Handled = true;
                    }
                    else
                        _listBox.Visibility = Visibility.Hidden;

                    if (_listBox.SelectedItem is ListBoxItem selectedItem)
                        selectedItem.Focus();
                    return;
                case Key.Back:
                    UpdateAutoComplete(null);
                    return;
                case Key.Tab:
                    EndAutoComplete();
                    e.Handled = true;
                    return;
                case Key.Escape:
                    _listBox.Visibility = Visibility.Hidden;
                    e.Handled = true;
                    return;
            }
        }

        /// <summary>
        /// Position the autocomplete listbox near the cursor
        /// Uses same positioning logic as AutoCompleteManager for RichTextBox
        /// </summary>
        private void SetAutoCompletePosition()
        {
            try
            {
                // Get caret position in screen coordinates relative to TextEditor
                var caretRect = _textEditor.TextArea.Caret.CalculateCaretRectangle();

                // Transform caret position to be relative to the TextView
                var textViewPosition = _textEditor.TextArea.TextView.TransformToAncestor(_textEditor).Transform(new Point(0, 0));

                // Calculate position using TextEditor's margin (same as RichTextBox approach)
                var x = _textEditor.Margin.Left + textViewPosition.X + caretRect.Left - 2;
                var y = _textEditor.Margin.Top + textViewPosition.Y + caretRect.Bottom;

                // Check if listbox should appear above or below
                if (y > _textEditor.ActualHeight - _listBox.MaxHeight)
                {
                    // Show above the cursor
                    y = _textEditor.Margin.Bottom + _textEditor.ActualHeight - caretRect.Top - textViewPosition.Y;
                    _listBox.Margin = new Thickness(x, 0, 0, y);
                    _listBox.VerticalAlignment = VerticalAlignment.Bottom;
                }
                else
                {
                    _listBox.Margin = new Thickness(x, y, 0, 0);
                    _listBox.VerticalAlignment = VerticalAlignment.Top;
                }
            }
            catch
            {
                // Fallback positioning - use fixed position
                _listBox.Margin = new Thickness(_textEditor.Margin.Left + 10, _textEditor.Margin.Top + 50, 0, 0);
                _listBox.VerticalAlignment = VerticalAlignment.Top;
            }
        }

        /// <summary>
        /// Update the autocomplete filter based on current input
        /// </summary>
        private void UpdateAutoComplete(string? input)
        {
            int offset = _textEditor.CaretOffset;
            int startOffset = _autoCompleteStartOffset;

            if (offset <= startOffset)
            {
                _listBox.Visibility = Visibility.Hidden;
                return;
            }

            // Get character before the start
            char c = startOffset > 0 ? _textEditor.Document.GetCharAt(startOffset - 1) : '\0';

            // Get current typed text
            string s = _textEditor.Document.GetText(startOffset, offset - startOffset);

            if (input == null)
            {
                // Backspace pressed
                if (s.Length > 1)
                    s = s[..^1];
                else
                {
                    _listBox.Visibility = Visibility.Hidden;
                    return;
                }
            }
            else
            {
                s += input;
            }

            _dispatcher.InvokeAsync(() => FilterAutoComplete(c, s), DispatcherPriority.Send);
        }

        /// <summary>
        /// Filter the autocomplete list based on prefix
        /// </summary>
        private void FilterAutoComplete(char c, string? s)
        {
            if (s is null)
                _listBox.Items.Filter = null;
            else if (s.Equals("code", StringComparison.OrdinalIgnoreCase))
            {
                // Special case: "code" shows ONLY external language parsers
                _listBox.Items.Filter =
                    x => ((ListBoxItem)x).Foreground == Brushes.DarkGreen;
            }
            else if (Validator.IsDigit(c))
                _listBox.Items.Filter =
                    x => ((string)((ListBoxItem)x).Content).StartsWith(s, StringComparison.OrdinalIgnoreCase) &&
                    ((ListBoxItem)x).Foreground == Brushes.DarkCyan;
            else
                _listBox.Items.Filter =
                    x => ((string)((ListBoxItem)x).Content).StartsWith(s, StringComparison.OrdinalIgnoreCase);

            if (_listBox.HasItems)
            {
                SortAutoComplete();
                _listBox.Visibility = Visibility.Visible;
            }
            else
                _listBox.Visibility = Visibility.Hidden;
        }

        /// <summary>
        /// Sort the autocomplete list
        /// </summary>
        private void SortAutoComplete()
        {
            _listBox.Items.SortDescriptions.Clear();
            if (_listBox.VerticalAlignment == VerticalAlignment.Bottom)
            {
                _listBox.Items.SortDescriptions.Add(new System.ComponentModel.SortDescription("Content", System.ComponentModel.ListSortDirection.Descending));
                _listBox.SelectedIndex = _listBox.Items.Count - 1;
            }
            else
            {
                _listBox.Items.SortDescriptions.Add(new System.ComponentModel.SortDescription("Content", System.ComponentModel.ListSortDirection.Ascending));
                _listBox.SelectedIndex = 0;
            }
            _listBox.ScrollIntoView(_listBox.SelectedItem);
        }

        /// <summary>
        /// Complete the autocomplete selection
        /// </summary>
        private void EndAutoComplete()
        {
            if (_listBox.SelectedItem is not ListBoxItem selectedItem)
                return;

            string s = (string)selectedItem.Content;
            var items = _listBox.Items;
            var index = items.IndexOf(selectedItem);

            // Check if next item has same content but different type (for units vs variables)
            if (index < items.Count - 1)
            {
                var nextItem = (ListBoxItem)items[index + 1];
                if (selectedItem.Foreground == Brushes.DarkCyan &&
                    nextItem.Foreground == Brushes.Blue &&
                    string.Equals((string)nextItem.Content, s, StringComparison.Ordinal))
                    s = "." + s;
            }

            // Replace text in document
            int currentOffset = _textEditor.CaretOffset;
            int replaceLength = currentOffset - _autoCompleteStartOffset;

            _textEditor.Document.Replace(_autoCompleteStartOffset, replaceLength, s);

            _listBox.Visibility = Visibility.Hidden;

            // Select inserted text (for functions with parentheses)
            SelectInsertedText(s);

            _textEditor.Focus();
        }

        /// <summary>
        /// Select parameter placeholders in inserted function text
        /// </summary>
        private void SelectInsertedText(string text)
        {
            int i = text.IndexOf('(');
            if (i > 0)
            {
                int j = text.IndexOf(')');
                if (j > i + 1)
                {
                    // Select the parameters between parentheses
                    int startOffset = _autoCompleteStartOffset + i + 1;
                    int length = j - i - 1;
                    _textEditor.Select(startOffset, length);
                }
            }
        }

        /// <summary>
        /// Move the autocomplete listbox when scrolling
        /// </summary>
        internal void MoveAutoComplete()
        {
            if (_listBox.Visibility == Visibility.Hidden)
                return;

            var verticalAlignment = _listBox.VerticalAlignment;
            SetAutoCompletePosition();

            // Check if the start position is still visible
            try
            {
                var caretRect = _textEditor.TextArea.Caret.CalculateCaretRectangle();
                var textViewPosition = _textEditor.TextArea.TextView.TransformToAncestor(_textEditor).Transform(new Point(0, 0));
                var y = textViewPosition.Y + caretRect.Top + caretRect.Height / 2;

                if (y < _textEditor.Margin.Top || y > _textEditor.Margin.Top + _textEditor.ActualHeight)
                {
                    _listBox.Visibility = Visibility.Hidden;
                    return;
                }

                // Re-sort if alignment changed
                if (_listBox.VerticalAlignment != verticalAlignment)
                    SortAutoComplete();
            }
            catch
            {
                // If we can't determine visibility, hide the autocomplete
                _listBox.Visibility = Visibility.Hidden;
            }
        }

        /// <summary>
        /// Restore autocomplete after paste or other operations
        /// </summary>
        internal void RestoreAutoComplete()
        {
            int offset = _textEditor.CaretOffset;
            if (offset == 0)
                return;

            // Get text before cursor
            var line = _textEditor.Document.GetLineByOffset(offset);
            var text = _textEditor.Document.GetText(line.Offset, offset - line.Offset);

            // Find start of current word
            int n = text.Length - 1;
            for (int i = n; i >= 0; --i)
            {
                n = i;
                if (!Validator.IsLetter(text[i]))
                    break;
                --n;
            }

            if (n < text.Length - 1)
            {
                _dispatcher.InvokeAsync(() =>
                {
                    var word = text[(n + 1)..];
                    _autoCompleteStartOffset = offset - word.Length;
                    SetAutoCompletePosition();
                    FilterAutoComplete(word[^1], word);
                }, DispatcherPriority.Send);
            }
        }

        /// <summary>
        /// Check if cursor is inside a comment
        /// </summary>
        internal bool IsInComment()
        {
            int offset = _textEditor.CaretOffset;
            var line = _textEditor.Document.GetLineByOffset(offset);
            var text = _textEditor.Document.GetText(line.Offset, offset - line.Offset).AsSpan();
            var i = text.IndexOfAny(HighLighter.Comments);
            if (i < 0)
                return false;
            var c = text[i];
            i = text.Count(c);
            return (i % 2 == 1);
        }

        /// <summary>
        /// Fill autocomplete with user-defined items
        /// </summary>
        internal void FillAutoComplete(UserDefined defs, int currentLineNumber)
        {
            _listBox.Items.Filter = null;
            _listBox.Items.SortDescriptions.Clear();
            var items = _listBox.Items;

            // Remove user-defined items (keep built-in items)
            for (int i = items.Count - 1; i >= _autoCompleteCount; --i)
                items.RemoveAt(i);

            try
            {
                FillDefined(defs.Variables, defs.MacroProcedures, Brushes.Blue, currentLineNumber);
                FillDefined(defs.FunctionDefs, defs.MacroProcedures, Brushes.Black, currentLineNumber);
                FillDefined(defs.Units, defs.MacroProcedures, Brushes.DarkCyan, currentLineNumber);
                FillDefined(defs.Macros, defs.MacroProcedures, Brushes.DarkMagenta, currentLineNumber);

                foreach (var kvp in defs.MacroParameters)
                {
                    var bounds = kvp.Value;
                    if (bounds[0] < currentLineNumber && currentLineNumber < bounds[1])
                        items.Add(new ListBoxItem()
                        {
                            Content = kvp.Key,
                            Foreground = Brushes.DarkMagenta
                        });
                }
            }
            catch { }

            void FillDefined(IEnumerable<KeyValuePair<string, int>> defs, Dictionary<string, string> macros, Brush foreground, int currentLineNumber)
            {
                foreach (var kvp in defs)
                {
                    var line = kvp.Value;
                    if (line < currentLineNumber && !IsPlot(kvp.Key))
                    {
                        var s = kvp.Key;
                        if (s[^1] == '$' && macros.TryGetValue(s, out var proc))
                            s += proc;

                        var item = new ListBoxItem()
                        {
                            Content = s
                        };
                        if (foreground == Brushes.Black)
                            item.FontWeight = FontWeights.Bold;
                        else
                            item.Foreground = foreground;

                        items.Add(item);
                    }
                }
            }

            bool IsPlot(string s) => s[0] == 'P' &&
                (s.Equals("PlotWidth", StringComparison.Ordinal) ||
                 s.Equals("PlotHeight", StringComparison.Ordinal) ||
                 s.Equals("PlotStep", StringComparison.Ordinal) ||
                 s.Equals("PlotSVG", StringComparison.Ordinal) ||
                 s.Equals("PlotPalette", StringComparison.Ordinal) ||
                 s.Equals("PlotShadows", StringComparison.Ordinal) ||
                 s.Equals("PlotSmooth", StringComparison.Ordinal) ||
                 s.Equals("PlotLightDir", StringComparison.Ordinal)
            );
        }

        private void AutoCompleteListBox_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (e.Source is ListBoxItem)
                EndAutoComplete();
        }

        private void AutoCompleteListBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key is Key.Escape)
                _textEditor.Focus();
            else if (
                e.Key is
                not Key.PageUp and
                not Key.PageDown and
                not Key.End and
                not Key.Home and
                not Key.Left and
                not Key.Up and
                not Key.Right and
                not Key.Down and
                not Key.LeftShift and
                not Key.RightShift and
                not Key.LeftCtrl and
                not Key.RightCtrl and
                not Key.LeftAlt and
                not Key.RightAlt
            )
            {
                e.Handled = true;
                EndAutoComplete();
            }
        }

        /// <summary>
        /// Check if autocomplete is visible
        /// </summary>
        internal bool IsVisible => _listBox.Visibility == Visibility.Visible;

        /// <summary>
        /// Hide the autocomplete listbox
        /// </summary>
        internal void Hide()
        {
            _listBox.Visibility = Visibility.Hidden;
        }
    }
}
