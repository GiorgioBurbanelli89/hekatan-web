namespace Hekatan.Common
{
    /// <summary>
    /// Specifies the environment in which Hekatan is running.
    /// Used to conditionally execute environment-specific logic.
    /// </summary>
    public enum HekatanEnvironment
    {
        /// <summary>
        /// Command-line interface environment
        /// </summary>
        Cli,

        /// <summary>
        /// Windows Presentation Foundation (GUI) environment
        /// </summary>
        Wpf,

        /// <summary>
        /// Python API environment
        /// </summary>
        Api
    }
}
