using System;
using System.IO;
using System.IO.Compression;
using System.Text.RegularExpressions;
using Hekatan.Core;

namespace Hekatan.Common
{
    /// <summary>
    /// Provides compression and decompression utilities for Hekatan files (.cpdz)
    /// Unified from Hekatan.Wpf and Hekatan.Cli implementations
    /// </summary>
    public static class Zip
    {
        private const string CodeFileName = "code.cpd";

        /// <summary>
        /// Compresses text using DeflateStream
        /// </summary>
        public static void Compress(string text, Stream fs)
        {
            using var ms = new MemoryStream();
            using var sw = new StreamWriter(ms);
            sw.Write(text);
            sw.Flush();
            ms.Position = 0;
            using var ds = new DeflateStream(fs, CompressionMode.Compress);
            ms.CopyTo(ds);
        }

        /// <summary>
        /// Compresses text along with referenced images into a ZIP archive
        /// Only used in WPF environment, but available for all
        /// </summary>
        public static void CompressWithImages(string text, string[] images, string fileName)
        {
            using FileStream zipStream = new(fileName, FileMode.Create);
            using ZipArchive archive = new(zipStream, ZipArchiveMode.Create);
            ZipArchiveEntry textEntry = archive.CreateEntry(Path.GetFileName(CodeFileName), CompressionLevel.Fastest);
            using (Stream entryStream = textEntry.Open())
            {
                Compress(text, entryStream);
            }
            if (images is null)
                return;

            var sourcePath = Path.GetDirectoryName(fileName);
            var sourceParent = Directory.GetDirectoryRoot(sourcePath);
            if (!string.Equals(sourceParent, sourcePath, StringComparison.OrdinalIgnoreCase))
                sourceParent = Directory.GetParent(sourcePath).FullName;

            var regexString = @"src\s*=\s*""\s*\.\./";
            for (int i = 0; i < 2; ++i)
            {
                foreach (var image in images)
                {
                    var m = Regex.Match(image, regexString, RegexOptions.IgnoreCase);
                    if (m.Success)
                    {
                        var n = m.Length;
                        var imageFileName = image[n..^1].Replace('/', '\\');
                        var imageFilePath = Path.Combine(sourceParent, imageFileName);
                        if (File.Exists(imageFilePath))
                        {
                            ZipArchiveEntry imageEntry = archive.CreateEntry(imageFileName, CompressionLevel.Fastest);
                            using Stream entryStream = imageEntry.Open();
                            using FileStream fileStream = File.OpenRead(imageFilePath);
                            fileStream.CopyTo(entryStream);
                        }
                    }
                }
                regexString = @"src\s*=\s*""\s*\./";
                if (string.Equals(sourceParent, sourcePath, StringComparison.OrdinalIgnoreCase))
                    return;
                sourceParent = sourcePath;
            }
        }

        /// <summary>
        /// Decompresses a DeflateStream and returns content as string
        /// Callers should use .EnumerateLines() from Hekatan.Core.ExtensionMethods for line iteration
        /// </summary>
        public static string Decompress(Stream fs)
        {
            using var ms = new MemoryStream();
            using (var ds = new DeflateStream(fs, CompressionMode.Decompress))
                ds.CopyTo(ms);
            ms.Position = 0;
            using var sr = new StreamReader(ms);
            return sr.ReadToEnd();
        }

        /// <summary>
        /// Checks if a file is a ZIP archive (composite format with images)
        /// </summary>
        public static bool IsComposite(string fileName)
        {
            var signature = "PK"u8; // Signature for ZIP files
            using FileStream fileStream = File.OpenRead(fileName);
            byte[] fileSignature = new byte[2];
            fileStream.ReadExactly(fileSignature, 0, 2);
            return signature.SequenceEqual(fileSignature);
        }

        /// <summary>
        /// Decompresses a ZIP archive containing code and images
        /// Extracts images to the same directory as the archive
        /// </summary>
        public static string DecompressWithImages(string fileName)
        {
            var filePath = Path.GetDirectoryName(fileName);
            string text = string.Empty;
            using (ZipArchive archive = ZipFile.OpenRead(fileName))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    string entryPath = Path.Combine(filePath, entry.FullName);
                    Directory.CreateDirectory(Path.GetDirectoryName(entryPath));
                    if (entry.Length == 0) // It's a directory
                        Directory.CreateDirectory(entryPath);
                    else // It's a file
                    {
                        if (string.Equals(entry.Name, CodeFileName, StringComparison.Ordinal))
                        {
                            using Stream entryStream = entry.Open();
                            text = Decompress(entryStream);
                        }
                        else
                            entry.ExtractToFile(entryPath, true);
                    }
                }
            }
            return text;
        }
    }
}
